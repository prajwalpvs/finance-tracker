import os
import re
from collections import Counter
import pdfplumber
from datetime import datetime

try:
    import pytesseract
    from pdf2image import convert_from_path
    _OCR_AVAILABLE = True
    # Windows default Tesseract path; override via TESSERACT_CMD env var
    _TESS_CMD = os.environ.get(
        'TESSERACT_CMD',
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
    )
    if os.path.exists(_TESS_CMD):
        pytesseract.pytesseract.tesseract_cmd = _TESS_CMD
    else:
        _OCR_AVAILABLE = False
except ImportError:
    _OCR_AVAILABLE = False


# Regex patterns for various bank statement formats
# Order matters — two-date formats must come before single-date to avoid mismatch
PATTERNS = [
    # Discover / BoA CC: MM/DD MM/DD DESCRIPTION ... AMOUNT  (trans date + post date)
    {
        'name': 'discover',
        're': re.compile(
            r'^(?P<date>\d{2}/\d{2})\s+\d{2}/\d{2}\s+(?P<desc>.+?)\s+(?P<amount>-?[\d,]+\.\d{2}(?:CR)?)\s*$',
            re.IGNORECASE,
        )
    },
    # BoA credit card with full year: MM/DD/YY MM/DD/YY DESCRIPTION AMOUNT
    {
        'name': 'boa_cc',
        're': re.compile(
            r'^(?P<date>\d{2}/\d{2}/\d{2,4})\s+\d{2}/\d{2}/\d{2,4}\s+(?P<desc>.+?)\s+(?P<amount>-?[\d,]+\.\d{2}(?:CR)?)\s*$',
            re.IGNORECASE,
        )
    },
    # Zolve / ISO date: YYYY-MM-DD DESCRIPTION AMOUNT
    {
        'name': 'zolve',
        're': re.compile(
            r'^(?P<date>\d{4}-\d{2}-\d{2})\s+(?P<desc>.+?)\s+\$?(?P<amount>-?[\d,]+\.\d{2}(?:CR)?)\s*$',
            re.IGNORECASE,
        )
    },
    # Chase: 01/15 SOME MERCHANT 123.45
    {
        'name': 'chase',
        're': re.compile(
            r'^(?P<date>\d{2}/\d{2})\s+(?P<desc>.+?)\s+(?P<amount>-?\$?[\d,]+\.\d{2}(?:CR)?)\s*$',
            re.IGNORECASE,
        )
    },
    # Citi: 01/15/24 SOME MERCHANT 123.45
    {
        'name': 'citi',
        're': re.compile(
            r'^(?P<date>\d{2}/\d{2}/\d{2,4})\s+(?P<desc>.+?)\s+(?P<amount>-?\$?[\d,]+\.\d{2}(?:CR)?)\s*$',
            re.IGNORECASE,
        )
    },
    # Bank of America / generic: 01/15/2024 SOME MERCHANT $123.45
    {
        'name': 'boa',
        're': re.compile(
            r'^(?P<date>\d{2}/\d{2}/\d{2,4})\s+(?P<desc>.+?)\s+\$?(?P<amount>-?[\d,]+\.\d{2}(?:CR)?)\s*$',
            re.IGNORECASE,
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
    r'statement period|account number|routing number|page \d+|'
    r'date\s+description\s+amount|transaction\s+date|posting\s+date|'
    r'trans\.\s*date|post\.\s*date|reference\s+number|'
    r'beginning balance|ending balance|total\s+fees|total\s+interest|'
    r'interest\s+charged|cashback\s+bonus|rewards\s+summary|'
    r'total\s+transactions|total\s+payments|total\s+purchases|'
    r'2026\s+totals|year-to-date)',
    re.IGNORECASE
)

PAYMENT_PATTERN = re.compile(
    r'(payment\s+thank\s+you|online\s+payment|autopay|payment\s+received|'
    r'payment\s+-\s+thank|direct\s+deposit|payroll|ach\s+deposit|'
    r'discover\s+payment|zolve\s+payment|bank\s+of\s+america\s+payment|'
    r'internet\s+payment|mobile\s+payment|e-payment)',
    re.IGNORECASE
)


def _normalize_amount(raw: str, is_parens: bool = False) -> tuple[float, bool]:
    """Returns (amount, is_credit). CR suffix means credit (income)."""
    is_cr = raw.upper().endswith('CR')
    clean = raw.upper().rstrip('CR').replace('$', '').replace(',', '').strip()
    val = float(clean)
    if is_parens:
        val = -abs(val)
    return val, is_cr


def _normalize_date(raw: str, year_hint: int = None) -> str:
    raw = raw.strip()
    # ISO: YYYY-MM-DD (Zolve)
    for fmt in ('%Y-%m-%d',):
        try:
            return datetime.strptime(raw, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
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


def _detect_type(description: str) -> str:
    if PAYMENT_PATTERN.search(description):
        return 'income'
    return 'expense'


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
            # is_parens only when amount is actually wrapped in () in the line
            amt_start = m.start('amount')
            is_parens = (
                pattern_def['name'] == 'parens'
                and amt_start > 0
                and line[amt_start - 1] == '('
            )
            raw_amount = m.group('amount')
            amount, is_cr = _normalize_amount(raw_amount, is_parens)
            date_str = _normalize_date(m.group('date'), year_hint)
            desc = m.group('desc').strip()
            # Strip trailing bank reference/account codes (4+ digit sequences at end)
            desc = re.sub(r'(\s+\d{3,})+\s*$', '', desc).strip()
            if len(desc) < 3 or re.match(r'^[\d\s\-\.]+$', desc):
                continue
            # CR suffix or negative amount = credit/income
            if is_cr or amount < 0:
                txn_type = 'income'
            else:
                txn_type = _detect_type(desc)
            return {
                'date': date_str,
                'description': desc,
                'amount': abs(amount),
                'type': txn_type,
            }
        except (ValueError, AttributeError):
            continue
    return None


def _ocr_pdf(file_path: str) -> str:
    """Render PDF pages to images and run Tesseract OCR on each."""
    poppler_path = os.environ.get('POPPLER_PATH')
    images = convert_from_path(
        file_path,
        dpi=300,
        poppler_path=poppler_path or None,
    )
    parts = []
    for img in images:
        text = pytesseract.image_to_string(img, lang='eng')
        if text:
            parts.append(text)
    return '\n'.join(parts)


def parse_pdf(file_path: str) -> list:
    transactions = []
    year_hint = None
    used_ocr = False

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
            if not _OCR_AVAILABLE:
                raise ValueError('no_text')
            full_text = _ocr_pdf(file_path)
            used_ocr = True
            if not full_text.strip():
                raise ValueError('no_text')

        # Use most common year in document (Counter beats first-match for multi-year PDFs)
        year_matches = re.findall(r'\b(20\d{2})\b', full_text)
        if year_matches:
            year_hint = int(Counter(year_matches).most_common(1)[0][0])

        for line in full_text.split('\n'):
            txn = _parse_line(line, year_hint)
            if txn:
                txn['_ocr'] = used_ocr
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
