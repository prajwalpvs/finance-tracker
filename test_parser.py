#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quick CLI test for the PDF parser + categorizer.
Usage: python test_parser.py path/to/statement.pdf
"""
import sys
import json
from services.pdf_parser import parse_pdf
from services.categorizer import categorize_all
from services.analyzer import build_summary, savings_tips


def main():
    if len(sys.argv) < 2:
        print('Usage: python test_parser.py <path-to-pdf>')
        sys.exit(1)

    pdf_path = sys.argv[1]
    print(f'\nParsing: {pdf_path}\n{"─" * 60}')

    try:
        txns = parse_pdf(pdf_path)
    except ValueError as e:
        if 'no_text' in str(e):
            print('[ERROR] No extractable text in PDF.')
            print('        This looks like a scanned image. Run OCR first.')
        else:
            print(f'[ERROR] {e}')
        sys.exit(1)
    except RuntimeError as e:
        print(f'[ERROR] {e}')
        sys.exit(1)

    if not txns:
        print('[WARN] No transactions found. Check PDF format.')
        sys.exit(0)

    categorize_all(txns)
    summary = build_summary(txns)
    tips = savings_tips(summary)

    print(f'Found {len(txns)} transactions\n')

    # Print table
    header = f'{"DATE":<12} {"DESCRIPTION":<40} {"CAT":<18} {"TYPE":<8} {"AMOUNT":>10}'
    print(header)
    print('─' * len(header))
    for t in txns:
        amt_str = '$' + f'{t["amount"]:,.2f}'
        print(
            f'{t["date"]:<12} '
            f'{t["description"][:38]:<40} '
            f'{t.get("category","Other")[:16]:<18} '
            f'{t["type"]:<8} '
            f'{amt_str:>10}'
        )

    print(f'\n{"─" * 60}')
    print(f'SUMMARY')
    print(f'  Total Spent:  ${summary["total_spent"]:,.2f}')
    print(f'  Total Income: ${summary["total_income"]:,.2f}')
    print(f'  Net:          ${summary["net"]:,.2f}')
    print(f'\nBy Category:')
    for cat, amt in summary['by_category'].items():
        bar = '█' * min(int(amt / max(summary['total_spent'], 1) * 30), 30)
        print(f'  {cat:<20} ${amt:>8,.2f}  {bar}')

    print(f'\nTop Merchants:')
    for m in summary['top_merchants'][:5]:
        print(f'  {m["name"]:<30} ${m["total"]:>8,.2f}  ({m["count"]}x)')

    if tips:
        print(f'\nSavings Tips:')
        for tip in tips:
            print(f'  [{tip["category"]}] {tip["message"]}')
            print(f'    → Save ~${tip["monthly_savings"]:,.2f}/month')


if __name__ == '__main__':
    main()
