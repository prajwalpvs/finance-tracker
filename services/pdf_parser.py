import re
import pdfplumber
from datetime import datetime


# Regex patterns for various bank statement formats
PATTERNS = [
    # Chase: 01/15 SOME MERCHANT 123.45
    {
        'name': 'chase',
        're': re.compile(
            r'^(?P<date>\d{2}/\d{2})\s+(?P<desc>.+?)\s+(?P<amount>-?\$?[\d,]+\.\d{2})\s*$'
        )
    },
    # Citi: 01/15/24 SOME MERCHANT 123.45
    {
        'name': 'citi',
        're': re.compile(
            r'^(?P<date>\d{2}/\d{2}/\d{2,4})\s+(?P<desc>.+?)\s+(?P<amount>-?\$?[\d,]+\.\d{2})\s*$'
        )
    },
    # Bank of America / generic: 01/15/2024 SOME MERCHANT $123.45
    {
        'name': 'boa',
        're': re.compile(
            r'^(?P<date>\d{2}/\d{2}/\d{2,4})\s+(?P<desc>.+?)\s+\$?(?P<amount>-?[\d,]+\.\d{2})\s*$'
        )
    },
    # Parentheses for negatives: 01/15 MERCHANT (123.45)
    {
        'name': 'parens',
        're': re.compile(
            r'^(?P<date>\d{2}/\d{2}(?:/\d{2,4})?)\s+(?P<desc>.+?)\s+\(?(?P<amount>[\d,]+\.\d{2})\)?\s*$'
        )
    },
    # Generic: any line with a date-like pattern and dollar amount
    {
        'name': 'generic',
        're': re.compile(
            r'(?P<date>\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+(?P<desc>[A-Za-z].+?)\s+\$?(?P<amount>-?[\d,]+\.\d{2})'
        )
    },
]

SKIP_PATTERNS = re.compile(
    r'(opening balance|closing balance|previous balance|new balance|'
    r'minimum payment|payment due|credit limit|available credit|'
    r'statement period|account number|routing number|page \d|'
    r'date\s+description\s+amount|transaction\s+date|posting\s+date|'
    r'beginning balance|ending balance|total\s+fees|total\s+interest)',
    re.IGNORECASE
)

PAYMENT_PATTERN = re.compile(
    r'(payment\s+thank\s+you|online\s+payment|autopay|payment\s+received|'
    r'payment\s+-\s+thank|direct\s+deposit|payroll|ach\s+deposit)',
    re.IGNORECASE
)


def _normalize_amount(raw: str, is_parens: bool = False) -> float:
    clean = raw.replace('$', '').replace(',', '').strip()
    val = float(clean)
    if is_parens:
        val = -abs(val)
    return val


def _normalize_date(raw: str, year_hint: int = None) -> str:
    raw = raw.strip()
    for fmt in ('%m/%d/%Y', '%m/%d/%y', '%m-%d-%Y', '%m-%d-%y'):
        try:
            return datetime.strptime(raw, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    # MM/DD without year
    for fmt in ('%m/%d', '%m-%d'):
        try:
            dt = datetime.strptime(raw, fmt)
            year = year_hint or datetime.now().year
            return dt.replace(year=year).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return raw


def _detect_type(description: str, amount: float) -> str:
    if PAYMENT_PATTERN.search(description):
        return 'income'
    return 'income' if amount < 0 else 'expense'


def _parse_line(line: str, year_hint: int = None) -> dict | None:
    line = line.strip()
    if not line or len(line) < 10:
        return None
    if SKIP_PATTERNS.search(line):
        return None

    for pattern_def in PATTERNS:
        m = pattern_def['re'].match(line) if pattern_def['name'] != 'generic' else pattern_def['re'].search(line)
        if not m:
            continue
        try:
            is_parens = ')' in line and '(' in line
            raw_amount = m.group('amount')
            amount = _normalize_amount(raw_amount, is_parens)
            date_str = _normalize_date(m.group('date'), year_hint)
            desc = m.group('desc').strip()
            # Skip very short or numeric-only descriptions
            if len(desc) < 3 or re.match(r'^[\d\s\-\.]+$', desc):
                continue
            txn_type = _detect_type(desc, amount)
            return {
                'date': date_str,
                'description': desc,
                'amount': abs(amount),
                'type': txn_type,
            }
        except (ValueError, AttributeError):
            continue
    return None


def parse_pdf(file_path: str) -> list:
    transactions = []
    year_hint = None

    try:
        with pdfplumber.open(file_path) as pdf:
            if not pdf.pages:
                return []

            full_text = ''
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text += text + '\n'

            if not full_text.strip():
                raise ValueError('no_text')

            # Try to extract a year from the document
            year_match = re.search(r'\b(20\d{2})\b', full_text)
            if year_match:
                year_hint = int(year_match.group(1))

            for line in full_text.split('\n'):
                txn = _parse_line(line, year_hint)
                if txn:
                    transactions.append(txn)

    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(f'Failed to parse PDF: {e}') from e

    # Deduplicate (same date + desc + amount)
    seen = set()
    unique = []
    for t in transactions:
        key = (t['date'], t['description'][:30], t['amount'])
        if key not in seen:
            seen.add(key)
            unique.append(t)

    return unique
