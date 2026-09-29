<?php
// E-mail settings for the PHP form routes. The deploy workflow writes
// api/oppsett.php from the GitHub secrets SKJEMA_TIL and SKJEMA_FRA; copy
// this file to oppsett.php by hand only when uploading without the workflow.
// `fra` must be an address on the site's own domain (a one.com mailbox),
// or the host may refuse to send.
return [
    'til' => '',
    'fra' => '',
];
