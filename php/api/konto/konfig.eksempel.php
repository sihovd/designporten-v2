<?php
// Settings for member accounts. Copy to api/konto/konfig.php on the web host
// (never commit the real file, never put it in a release zip).
// Without this file the accounts are switched off. They may use the same
// database as the CMS, but it must be named here. See docs/konto.md.
return [
    // one.com: Control panel → Databases → the MySQL database's host, name, user, password.
    'dsn' => 'mysql:host=DATABASEVERT;dbname=DATABASENAVN;charset=utf8mb4',
    'bruker' => '',
    'passord' => '',
    // Legacy only, for a host that already ran accounts on the CMS's settings:
    // leave 'dsn' out and set this to true to read api/cms/konfig.php instead.
    // A test build ignores it.
    // 'bruk_cms_database' => true,
];
