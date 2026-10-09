"""Opt-in synthetic conversation test; starts and stops the actual local AI and API."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time

import httpx

from scripts.check_backend import BASE, start
from scripts.government_workflow import check_forms


def generation_metrics(client, endpoint):
    response = client.get(endpoint + '/metrics', timeout=10)
    response.raise_for_status()
    counts = {line.split()[0]: float(line.split()[1])
              for line in response.text.splitlines()
              if line and not line.startswith('#') and len(line.split()) == 2}
    return counts['llamacpp:tokens_predicted_total'], counts['llamacpp:tokens_predicted_seconds_total']


def cpu_seconds(process):
    if process is None:
        return 0
    try:
        stat = Path(f'/proc/{process.pid}/stat').read_text().split()
        return sum(int(stat[index]) for index in (13, 14, 15, 16)) / os.sysconf('SC_CLK_TCK')
    except (FileNotFoundError, ProcessLookupError):
        return 0


def check_conversation():
    from backend.inference import GPU_LAYERS, MODEL, REASONING_BUDGET
    root = Path(__file__).resolve().parents[1]
    runtime = root / '.runtime'
    llama = runtime / 'llama-cuda' / 'llama-b11429'
    model = runtime / 'models' / (MODEL + '.gguf')
    forms = root / 'skills/government-form-assistant/assets/forms'
    defaults = json.loads((forms / 'defaults.json').read_text())
    for process in Path('/proc').glob('[0-9]*/comm'):
        try:
            if process.read_text().strip() == 'llama-server':
                raise RuntimeError('Stop existing llama servers before this sequential benchmark.')
        except (FileNotFoundError, ProcessLookupError):
            pass
    run_started = time.perf_counter()
    report = {'model': MODEL, 'context_tokens': 8192, 'gpu_layers': GPU_LAYERS,
              'reasoning_budget': REASONING_BUDGET, 'passed': False, 'api_calls': []}
    os.environ['PATH'] = str(runtime / 'tesseract/usr/bin') + os.pathsep + os.environ['PATH']
    libraries = [runtime / 'tesseract/usr/lib',
                 runtime / 'llama-cuda/cudart-llama-b11429-bin-ubuntu-cuda-12.8-x64', llama]
    os.environ['LD_LIBRARY_PATH'] = os.pathsep.join(map(str, libraries)) + (
        os.pathsep + os.environ['LD_LIBRARY_PATH'] if os.environ.get('LD_LIBRARY_PATH') else '')
    os.environ['TESSDATA_PREFIX'] = str(runtime / 'tesseract/usr/share/tessdata')
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    endpoint = f'http://127.0.0.1:{port}'
    os.environ['PAPELLESS_LLAMA_URL'] = endpoint
    print(f'Starting local {MODEL} on CUDA; synthetic data only.', flush=True)
    inference = subprocess.Popen([
        str(llama / 'llama-server'), '--model', str(model),
        '--alias', MODEL, '--host', '127.0.0.1', '--port', str(port),
        '--device', 'CUDA0', '--gpu-layers', str(GPU_LAYERS), '--ctx-size', '8192',
        '--parallel', '1', '--threads', '4', '--threads-batch', '4',
        '--batch-size', '256', '--ubatch-size', '128', '--cache-ram', '0',
        '--jinja', '--reasoning-budget', str(REASONING_BUDGET),
        '--reasoning', 'on' if REASONING_BUDGET else 'off', '--no-webui', '--no-slots',
        '--offline', '--log-disable', '--metrics'], cwd=root)
    api = None
    try:
        with tempfile.TemporaryDirectory() as directory, httpx.Client(timeout=600) as client:
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                if inference.poll() is not None:
                    raise RuntimeError('Local inference exited during startup; check CUDA availability.')
                try:
                    if client.get(endpoint + '/health', timeout=1).is_success:
                        break
                except httpx.TransportError:
                    pass
                time.sleep(0.2)
            else:
                raise RuntimeError('Local inference startup timed out.')
            api = start(directory)

            def post(route, **kwargs):
                before = generation_metrics(client, endpoint) if route.endswith('/messages') else None
                started = time.perf_counter()
                cpu_before = (cpu_seconds(api), cpu_seconds(inference))
                response = client.post(BASE + route, **kwargs)
                elapsed = time.perf_counter() - started
                result = response.json()
                record = {'route': route, 'seconds': elapsed, 'http_status': response.status_code,
                          'input': kwargs.get('json'), 'output': result}
                record['cpu_seconds'] = {'api_and_ocr': cpu_seconds(api) - cpu_before[0],
                                         'inference': cpu_seconds(inference) - cpu_before[1]}
                report['api_calls'].append(record)
                if route.endswith('/messages'):
                    latency = time.perf_counter() - started
                    after = generation_metrics(client, endpoint)
                    tokens, seconds = after[0] - before[0], after[1] - before[1]
                    speed = f'; model {tokens / seconds:.2f} toks/s' if seconds else '; no model generation'
                    record.update(generated_tokens=tokens, generation_seconds=seconds)
                    print(f'API turn: {latency:.2f}s{speed}', flush=True)
                elif route.endswith('/documents'):
                    print(f'Document extraction/OCR: {elapsed:.2f}s', flush=True)
                if not response.is_success:
                    print('API failure:', response.status_code, result, flush=True)
                response.raise_for_status()
                return result

            report['forms'] = check_forms(
                forms, defaults, client, post,
                runtime / 'benchmarks' / f'{MODEL}-government-flow-drafts')
            report['passed'] = True
    finally:
        try:
            with httpx.Client(timeout=10) as client:
                tokens, seconds = generation_metrics(client, endpoint)
                report['generation'] = {'tokens': tokens, 'seconds': seconds,
                                        'tokens_per_second': tokens / seconds if seconds else None}
                if seconds:
                    print(f'Model generation: {tokens / seconds:.2f} toks/s '
                          f'({tokens:.0f} output tokens / {seconds:.2f}s; excludes prompt processing).',
                          flush=True)
        except (httpx.HTTPError, KeyError, ValueError) as error:
            print(f'Model throughput unavailable: {type(error).__name__}', flush=True)
        report['cpu_seconds'] = {'api_and_ocr': cpu_seconds(api),
                                'inference': cpu_seconds(inference)}
        for process in (api, inference):
            if process is not None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        report['elapsed_seconds'] = time.perf_counter() - run_started
        destination = runtime / 'benchmarks' / f'{MODEL}-government-flow.json'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, indent=2) + '\n')
        print(f'Benchmark and full API transcript: {destination}', flush=True)


if __name__ == '__main__':
    check_conversation()
