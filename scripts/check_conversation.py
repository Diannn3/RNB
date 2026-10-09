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


def check_conversation():
    from backend.inference import GPU_LAYERS, MODEL, REASONING_BUDGET
    root = Path(__file__).resolve().parents[1]
    runtime = root / '.runtime'
    llama = runtime / 'llama-cuda' / 'llama-b11429'
    model = runtime / 'models' / (MODEL + '.gguf')
    forms = root / 'skills/government-form-assistant/assets/forms'
    defaults = json.loads((forms / 'defaults.json').read_text())
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
        with tempfile.TemporaryDirectory() as directory, httpx.Client(timeout=240) as client:
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
                response = client.post(BASE + route, **kwargs)
                if route.endswith('/messages'):
                    latency = time.perf_counter() - started
                    after = generation_metrics(client, endpoint)
                    tokens, seconds = after[0] - before[0], after[1] - before[1]
                    speed = f'; model {tokens / seconds:.2f} toks/s' if seconds else '; no model generation'
                    print(f'API turn: {latency:.2f}s{speed}', flush=True)
                response.raise_for_status()
                return response.json()

            check_forms(forms, defaults, client, post)
    finally:
        try:
            with httpx.Client(timeout=10) as client:
                tokens, seconds = generation_metrics(client, endpoint)
                if seconds:
                    print(f'Model generation: {tokens / seconds:.2f} toks/s '
                          f'({tokens:.0f} output tokens / {seconds:.2f}s; excludes prompt processing).',
                          flush=True)
        except (httpx.HTTPError, KeyError, ValueError) as error:
            print(f'Model throughput unavailable: {type(error).__name__}', flush=True)
        for process in (api, inference):
            if process is not None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == '__main__':
    check_conversation()
