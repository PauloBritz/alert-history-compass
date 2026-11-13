import math
import re


def normalized(text):
    return ' '.join(text.upper().split())


def classify(title):
    text = normalized(title)
    rules = [(r'\bLINK\s+(?:IS\s+)?DOWN\b', 'LINK DOWN'),
             (r'\bINTERFACE\s+\d+(?:/\d+)+(?:\s+(?:IS\s+)?DOWN)?\b', 'INTERFACE DOWN'),
             (r'\bZABBIX AGENT IS NOT AVAILABLE\b', 'ZABBIX AGENT UNAVAILABLE')]
    matches = {name for pattern, name in rules if re.search(pattern, text)}
    return next(iter(matches)) if len(matches) == 1 else None


def statistics(positive, negative):
    total = positive + negative
    rate = positive / total if total else 0
    z = 1.96
    lower = ((rate + z*z/(2*total) - z*math.sqrt(rate*(1-rate)/total + z*z/(4*total*total))) / (1+z*z/total)) if total else 0
    return dict(positivos=positive, negativos=negative, total=total,
                taxa_sucesso=round(rate*100, 1) if total else None,
                confidence=round(lower, 6), validation='VALIDADA' if total else 'AINDA NÃO VALIDADA')


def sufficient(items, policy):
    return bool(policy and any(s['total'] >= policy['min_evaluations'] and s['confidence'] >= policy['wilson_lower'] and (s['taxa_sucesso'] or 0) >= policy['min_success'] for s in items))
