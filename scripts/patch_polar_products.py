#!/usr/bin/env python3
"""Patch Polar products with professional descriptions + metadata."""
import json, urllib.request

FN = "https://ffoevhldpppyfsfgufmx.supabase.co/functions/v1/polar-admin"
payload = {
    "action": "patch",
    "products": [
        {
            "id": "7e27d794-9e05-463b-82e3-44016c3e1495",
            "name": "MarketWise Starter",
            "description": "2 full marketing analyses per month. Each report includes live market research with cited sources, verified competitor analysis, an 18-point SEO audit of your actual website, honest 0\u2013100 scores, and a prioritized 7/30/60/90-day action roadmap. Cancel anytime \u2014 you keep access until the period ends.",
            "metadata": {"reports_per_period": "2", "plan": "starter"},
        },
        {
            "id": "9f1761be-8e0c-4eb0-8992-45aad45d9758",
            "name": "MarketWise Pro",
            "description": "4 full marketing analyses per month \u2014 for founders actively iterating. Everything in Starter, plus double the analyses so you can track your score over time, watch competitor moves, and re-audit after every change you ship. Cancel anytime \u2014 you keep access until the period ends.",
            "metadata": {"reports_per_period": "4", "plan": "pro"},
        },
    ],
}
req = urllib.request.Request(FN, data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
print(urllib.request.urlopen(req, timeout=60).read().decode())
