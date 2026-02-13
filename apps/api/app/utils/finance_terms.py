from __future__ import annotations

FINANCE_TERM_HINTS = {
    "pe": {
        "name": "P/E Ratio",
        "simple": "How expensive a stock is compared to company profits.",
        "analogy": "Like checking if rent is too high compared to your monthly salary.",
        "formula": "Price per share / EPS",
        "unit": "x",
    },
    "roe": {
        "name": "Return on Equity",
        "simple": "How effectively the company uses shareholder money to generate profits.",
        "analogy": "If you lend someone $100 and they consistently turn it into $120, efficiency is high.",
        "formula": "Net Income / Average Shareholder Equity",
        "unit": "%",
    },
    "debt_to_equity": {
        "name": "Debt to Equity",
        "simple": "How much borrowing a company uses compared to owners' money.",
        "analogy": "Buying a house mostly on a loan versus mostly from your savings.",
        "formula": "Total Liabilities / Shareholder Equity",
        "unit": "x",
    },
    "profit_margin": {
        "name": "Profit Margin",
        "simple": "How much profit remains from each dollar in sales.",
        "analogy": "If you sell lemonade for $10 and keep $2 after costs, your margin is 20%.",
        "formula": "Net Income / Revenue",
        "unit": "%",
    },
    "revenue_growth": {
        "name": "Revenue Growth",
        "simple": "How fast company sales are increasing over time.",
        "analogy": "Your salary increasing every year at a steady pace.",
        "formula": "(Current Revenue - Prior Revenue) / Prior Revenue",
        "unit": "%",
    },
}
