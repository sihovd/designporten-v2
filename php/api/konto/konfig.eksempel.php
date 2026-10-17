<?php
// Settings for member accounts. Copy to api/konto/konfig.php on the web host
// (never commit the real file, never put it in a release zip).
// Until this file exists, the accounts use api/cms/konfig.php as before.
// It may point at the same database as the CMS. See docs/konto.md.
return [
    // one.com: Control panel → Databases → the MySQL database's host, name, user, password.
    'dsn' => 'mysql:host=DATABASEVERT;dbname=DATABASENAVN;charset=utf8mb4',
    'bruker' => '',
    'passord' => '',
];
