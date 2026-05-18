# -*- coding: utf-8 -*-
from collections import defaultdict


def build_summary(transactions: list) -> dict:
    if not transactions:
        return {
            'total_spent': 0,
            'total_income': 0,
            'net': 0,
            'by_category': {},
            'by_month': {},
            'top_merchants': [],
            'transaction_count': 0,
            'date_range': {'start': None, 'end': None},
        }

    total_spent = 0.0
    total_income = 0.0
    by_category = defaultdict(float)
    by_month = defaultdict(float)
    merchant_totals = defaultdict(float)
    merchant_counts = defaultdict(int)
    dates = []

    for txn in transactions:
        amount = txn.get('amount', 0)
        txn_type = txn.get('type', 'expense')
        category = txn.get('category', 'Other')
        date = txn.get('date', '')
        desc = txn.get('description', 'Unknown')

        if txn_type == 'expense':
            total_spent += amount
            by_category[category] += amount
        else:
            total_income += amount

        month = date[:7] if date else 'Unknown'
        if txn_type == 'expense':
            by_month[month] += amount

        merchant_key = _normalize_merchant(desc)
        merchant_totals[merchant_key] += amount
        merchant_counts[merchant_key] += 1

        if date:
            dates.append(date)

    top_merchants = sorted(
        [
            {'name': name, 'total': round(total, 2), 'count': merchant_counts[name]}
            for name, total in merchant_totals.items()
        ],
        key=lambda x: x['total'],
        reverse=True,
    )[:10]

    return {
        'total_spent': round(total_spent, 2),
        'total_income': round(total_income, 2),
        'net': round(total_income - total_spent, 2),
        'by_category': {k: round(v, 2) for k, v in sorted(by_category.items(), key=lambda x: x[1], reverse=True)},
        'by_month': dict(sorted(by_month.items())),
        'top_merchants': top_merchants,
        'transaction_count': len(transactions),
        'date_range': {
            'start': min(dates) if dates else None,
            'end': max(dates) if dates else None,
        },
    }


def _normalize_merchant(description: str) -> str:
    words = description.split()
    # Take first 3 meaningful words as merchant name
    meaningful = [w for w in words if len(w) > 1 and not w.replace('*', '').replace('#', '').isdigit()]
    return ' '.join(meaningful[:3]).title() if meaningful else description[:20].title()


def savings_tips(summary: dict) -> list:
    tips = []
    total_spent = summary.get('total_spent', 0)
    by_category = summary.get('by_category', {})
    top_merchants = summary.get('top_merchants', [])

    if total_spent == 0:
        return []

    # Tip 1: categories >20% of spending
    for category, amount in by_category.items():
        if category == 'Other':
            continue
        pct = amount / total_spent
        if pct > 0.20:
            suggested_cut = amount * 0.15
            tips.append({
                'category': category,
                'message': f'{category} is {pct:.0%} of your spending (${amount:,.2f}). Try cutting 15%.',
                'current_spend': round(amount, 2),
                'suggested_cut': round(suggested_cut, 2),
                'monthly_savings': round(suggested_cut / _months_in_summary(summary), 2),
                'icon': _category_icon(category),
            })

    # Tip 2: merchants visited >5 times
    repeat_merchants = [m for m in top_merchants if m['count'] >= 5]
    for merchant in repeat_merchants[:2]:
        suggested_cut = merchant['total'] * 0.25
        tips.append({
            'category': 'Frequent Spending',
            'message': f"You visited {merchant['name']} {merchant['count']} times (${merchant['total']:,.2f} total). Reducing by 25% saves money.",
            'current_spend': round(merchant['total'], 2),
            'suggested_cut': round(suggested_cut, 2),
            'monthly_savings': round(suggested_cut / _months_in_summary(summary), 2),
            'icon': '🔄',
        })

    # Tip 3: subscriptions check
    sub_amount = by_category.get('Subscriptions', 0)
    if sub_amount > 50:
        tips.append({
            'category': 'Subscriptions',
            'message': f'You spend ${sub_amount:,.2f} on subscriptions. Audit unused ones — cancel 1-2 to save.',
            'current_spend': round(sub_amount, 2),
            'suggested_cut': round(sub_amount * 0.30, 2),
            'monthly_savings': round(sub_amount * 0.30 / _months_in_summary(summary), 2),
            'icon': '📦',
        })

    # Tip 4: dining out suggestion
    dining = by_category.get('Food & Dining', 0)
    groceries = by_category.get('Groceries', 0)
    if dining > 0 and groceries > 0 and dining > groceries:
        savings = (dining - groceries) * 0.20
        tips.append({
            'category': 'Food & Dining',
            'message': f'You spend ${dining:,.2f} dining out vs ${groceries:,.2f} on groceries. Cooking more could save significantly.',
            'current_spend': round(dining, 2),
            'suggested_cut': round(savings, 2),
            'monthly_savings': round(savings / _months_in_summary(summary), 2),
            'icon': '🍽️',
        })

    # Tip 5: transport tip
    transport = by_category.get('Transport', 0)
    if transport > 200:
        tips.append({
            'category': 'Transport',
            'message': f'Transport costs ${transport:,.2f}. Consider carpooling, public transit, or consolidating trips.',
            'current_spend': round(transport, 2),
            'suggested_cut': round(transport * 0.20, 2),
            'monthly_savings': round(transport * 0.20 / _months_in_summary(summary), 2),
            'icon': '🚗',
        })

    return tips[:5]


def _months_in_summary(summary: dict) -> int:
    months = len(summary.get('by_month', {}))
    return max(months, 1)


def _category_icon(category: str) -> str:
    icons = {
        'Food & Dining': '🍔',
        'Groceries': '🛒',
        'Transport': '🚗',
        'Shopping': '🛍️',
        'Entertainment': '🎬',
        'Subscriptions': '📦',
        'Utilities': '💡',
        'Health': '🏥',
        'Travel': '✈️',
        'Rent & Housing': '🏠',
        'Fitness': '💪',
        'Education': '📚',
        'Other': '💰',
    }
    return icons.get(category, '💰')
