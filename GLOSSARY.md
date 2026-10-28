# MailGuard

MailGuard tells someone how well a domain is protected against being spoofed, and whether it appears on mail blocklists.

## Language

**Domain**:
The DNS name whose email security posture is being assessed. When someone enters an email address, the Domain is the part after the `@`.
_Avoid_: Email, email address, target

**Scan**:
One assessment of a single Domain, made up of a fixed set of Checks.
_Avoid_: Lookup, search, test

**Check**:
One assessment within a Scan, such as SPF, DMARC, MX or one Blocklist.
_Avoid_: Test, probe

**Check Result**:
The outcome of a Check: Pass, Warning, Fail or Inconclusive.
_Avoid_: Status, score

**Verdict**:
The single overall rating of a Scan: High Risk, At Risk, Incomplete or Well Configured, taken from its worst Check Result.
_Avoid_: Score, grade, "Secure"

**Inconclusive**:
A Check Result meaning the Check could not determine an answer, for example because of a timeout or a refused query. It is never treated as a Pass or a Fail.
_Avoid_: Error, unknown, skipped

**Organizational Domain**:
The registrable domain above a Domain (e.g. `example.com` for `mail.example.com`), where DMARC policy is looked up if the Domain itself publishes none.
_Avoid_: Root domain, parent domain, apex

**Blocklist**:
A published DNS-based list of domains or IP addresses known to send spam or abuse.
_Avoid_: Blacklist, RBL, DNSBL

**Sending IP**:
An individual IP address the Domain's SPF record declares as authorised to send its mail.
_Avoid_: Outbound IP, sender

**Receiving IP**:
An IP address of one of the Domain's MX hosts.
_Avoid_: MX IP, inbound IP
