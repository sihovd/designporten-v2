<?php
// Stripe settings for card payment on one.com. Copy to api/stripe/konfig.php
// on the web host and fill in there. NEVER commit the real file, and never
// paste the keys in a chat. See docs/betaling.md.
return [
    // Stripe → Developers → API keys. Test mode first: sk_test_… (or a
    // restricted key rk_test_… with write access to Checkout Sessions).
    'hemmelig_nokkel' => '',
    // Stripe → Developers → Webhooks → your endpoint → Signing secret (whsec_…).
    'webhook_hemmelighet' => '',
    // Optional: the public address, e.g. https://www.designporten.no. Empty =
    // taken from the request.
    'nettsted_url' => '',
    // Live keys (sk_live_/rk_live_) are refused until this is true. Only Sivert
    // switches it on, when the shop terms, prices and shipping are ready.
    'tillat_live' => false,
];
