<?php
// Stripe settings for card payment on one.com. Copy to api/stripe/konfig.php
// on the web host and fill in there. NEVER commit the real file, and never
// paste the keys in a chat. See docs/betaling.md.
return [
    // Stripe → Developers → API keys (Test mode off): sk_live_… (or a restricted
    // key rk_live_… with write access to Checkout Sessions). sk_test_… for tests.
    'hemmelig_nokkel' => '',
    // Stripe → Developers → Webhooks → your endpoint → Signing secret (whsec_…).
    'webhook_hemmelighet' => '',
    // Optional: the public address, e.g. https://www.designporten.no. Empty =
    // taken from the request.
    'nettsted_url' => '',
    // Live keys (sk_live_/rk_live_) are refused until this is true: the switch
    // for real money, set by Sivert on the server.
    'tillat_live' => false,
];
