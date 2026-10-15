<?php
// Settings for the Designporten CMS. Copy to api/cms/konfig.php on the web
// host (never commit the real file). See docs/cms/README.md#slik-slas-cms-et-pa.
return [
    // one.com: Control panel → Databases → the MySQL database's host, name, user, password.
    'dsn' => 'mysql:host=DATABASEVERT;dbname=DATABASENAVN;charset=utf8mb4',
    'bruker' => '',
    'passord' => '',
    // A long random code (at least 16 characters). Needed once, to create the first admin at /cms/.
    'oppsettkode' => '',
];
