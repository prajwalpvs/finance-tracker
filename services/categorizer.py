import json
import os

_categories = None
_categories_mtime = 0

def _load_categories():
    global _categories, _categories_mtime
    categories_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'categories.json')
    mtime = os.path.getmtime(categories_path)
    if _categories is None or mtime != _categories_mtime:
        with open(categories_path, 'r') as f:
            _categories = json.load(f)
        _categories_mtime = mtime
    return _categories


def categorize(description: str) -> str:
    categories = _load_categories()
    desc_lower = description.lower()
    for category, keywords in categories.items():
        if category == 'Other':
            continue
        for keyword in keywords:
            if keyword in desc_lower:
                return category
    return 'Other'


def categorize_all(transactions: list) -> list:
    for txn in transactions:
        txn['category'] = categorize(txn.get('description', ''))
    return transactions
