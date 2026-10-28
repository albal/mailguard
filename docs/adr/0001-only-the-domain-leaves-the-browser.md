# Only the Domain leaves the browser

Every Check in a Scan operates on the Domain; the local part of an email address contributes nothing. The frontend therefore strips the local part before calling the API, so the Worker never receives, logs or caches an email address. This keeps personal data out of the backend entirely, at the cost of the API being unable to ever offer mailbox-level checks without revisiting this decision.
