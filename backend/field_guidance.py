"""Offline semantic guidance; never a source of runtime form mappings."""
import json
from pathlib import Path
import re

BANK = Path(__file__).resolve().parents[1] / 'skills/government-service-explainer/references/fields'
HELP = re.compile(r"(?:please\s+)?(?:(?:can|could) you\s+)?(?:explain(?: (?:this|the)(?: field| question))?|help(?: me)?|what does (?:this|that|this field) mean|what (?:should|do) i (?:put|enter|write)(?: (?:here|in this field|for this field))?)[.!?]*", re.I)


def normalize(text):
    return ' '.join(re.findall(r'[a-z0-9]+', text.lower()))


def is_field_help(query):
    return bool(HELP.fullmatch(query.strip()))


def identify_form(structure):
    if not structure:
        return None
    text = ' ' + normalize(' '.join(page['text'] for page in structure['pages'])) + ' '
    index = json.loads((BANK / 'index.json').read_text(encoding='utf-8'))
    matches = [entry for entry in index if all(
        ' ' + normalize(marker) + ' ' in text for marker in entry['document_markers'])]
    if len(matches) != 1:
        return None
    return json.loads((BANK / matches[0]['file']).read_text(encoding='utf-8'))


def source_slot(structure, field):
    identity = field.get('widget_id') or field.get('box_id') or field.get('id')
    for widget in structure.get('widgets', []):
        if widget['id'] == identity:
            return dict(widget)
    for page in structure['pages']:
        for box in page['boxes']:
            if box['id'] == identity:
                return {**box, 'page': page['page']}
    return None


def slot_context(structure, slot):
    """Inherit a printed owner heading above the field, not a stored coordinate."""
    context = slot.get('context', '')
    page = next((p for p in structure['pages'] if p['page'] == slot.get('page')), None)
    if not page or not slot.get('rect'):
        return normalize(context)
    groups = (
        r'^(?:name of person making request|organization agency)$',
        r'^(?:member|mother s maiden name|spouse(?: if married)?|dependents?)$',
        r'^(?:permanent address|mailing address)$',
    )
    for pattern in groups:
        headings = [box for box in page['boxes'] if box.get('source') != 'layout'
                    and box.get('rect') and box['rect'][1] >= slot['rect'][3] - 6
                    and re.fullmatch(pattern, normalize(box.get('text', '')))]
        if headings:
            context += ' ' + min(headings, key=lambda b: b['rect'][1])['text']
    return normalize(context)


def match_field(structure, field):
    form = identify_form(structure)
    slot = source_slot(structure, field) if structure and field else None
    if not form or not slot:
        return form, None
    label = normalize(slot.get('field_name') or slot.get('text', ''))
    context = slot_context(structure, slot)
    candidates = []
    for entry in form['fields']:
        aliases = [normalize(value) for value in [entry['label'], *entry['aliases']]]
        score = max((1000 + len(alias) if label == alias else len(alias)
                     if alias and ' ' + alias + ' ' in ' ' + label + ' ' else 0
                     for alias in aliases), default=0)
        if not score:
            continue
        contexts = entry.get('contexts', [])
        if contexts and not any(normalize(value) in context for value in contexts):
            continue
        candidates.append((score + (100 if contexts else 0), entry))
    if not candidates:
        return form, None
    best = max(score for score, _ in candidates)
    winners = [entry for score, entry in candidates if score == best]
    return form, winners[0] if len(winners) == 1 else None


def matches_field_query(query, structure, field):
    _, entry = match_field(structure, field)
    if not entry:
        return False
    wanted = re.sub(r'^(?:please )?(?:explain|define|what is|what does) ', '', normalize(query))
    wanted = re.sub(r' mean$', '', wanted)
    return wanted in [normalize(value) for value in [entry['label'], *entry['aliases']]]


def explain_field(structure, field):
    form, entry = match_field(structure, field)
    if not field:
        return 'Start or resume the form, then choose Explain this field. Which field do you need help with?', 'needs_input', []
    if not form:
        return 'I cannot confidently identify this form in the offline knowledge bank. What is the printed form title?', 'needs_input', []
    if not entry:
        return 'I do not have unambiguous guidance for this field and section. Which person or section does this field refer to?', 'needs_input', []
    citation = {'term': f"{form['title']} · {entry['label']} (page {entry['source_page']})",
                'feed': form['agency'], 'url': form['url']}
    text = f"{entry['label']}: {entry['meaning']} {entry['input']}"
    if entry['protected'] or field.get('protected'):
        text += ' Leave this field blank in PapelLess; it is not an answer to prepare here.'
    else:
        slot = source_slot(structure, field)
        if field.get('type') == 'checkbox' and slot:
            text += f" For this checkbox, answer Yes to select {slot.get('text', entry['label'])}, or No to leave it unchecked."
        if entry.get('format'):
            text += ' ' + entry['format']
        if entry.get('options'):
            text += ' Printed choices: ' + ', '.join(entry['options']) + '.'
        if entry.get('example'):
            text += ' Fictional example: ' + entry['example'] + '.'
    if entry.get('uncertainty'):
        text += ' ' + entry['uncertainty']
    text += f"\n\nSource: {form['agency']}, page {entry['source_page']}. Reference checked {form['checked_on']}."
    return text, 'completed', [citation]


def grounded_question(structure, field):
    _, entry = match_field(structure, field)
    if entry and not entry['protected'] and not field.get('protected'):
        if field.get('type') == 'checkbox':
            slot = source_slot(structure, field)
            label = slot.get('text') or slot.get('field_name') or entry['label']
            return f"For {entry['label']}, should this draft select {label}? Answer Yes or No."
        return entry['question']
    return None
