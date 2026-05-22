# Security Specification & Threat Model - MRZ Gallery

This specification describes the data integrity boundaries, authorization vectors, and verification payloads used to secure the MRZ Gallery Firestore database.

## 1. Data Invariants & Security Architecture
- **Messages Collection (`messages`)**: Contains synchronized Discord messages and manually broadcasted announcements.
  - **Read Access**: Publicly readable. Anyone can query standard messages to view the feed.
  - **Create / Update / Delete Access**: Strictly guarded. Only authorized administration identity or server actions are permitted to modify messages. No anonymous or unprivileged client-side writes. Every write must validate exact key structures and type safety.
- **Config Collection (`config`)**: Holds system and bot execution configurations.
  - **Read / Write Access**: Strictly private. Only verified master administrators are granted access.
- **Logs Collection (`logs`)**: Stores audit trail events.
  - **Read / Write Access**: Private. Only accessible by administrators.

## 2. The "Dirty Dozen" Threat Payloads (Verification Cases)
We test that the database rejects the following malicious attempts (PERMISSION_DENIED):

1. **Unauthenticated Message Injection**: An anonymous visitor attempts to write a fake message into the feed.
2. **Identity Spoofing (Owner Forgery)**: A regular user attempts to create a message with their `authorId` spoofed as a trusted guild admin.
3. **Ghost Field Mutation**: An attacker injects hidden control keys like `isAdmin: true` into a message document.
4. **PII Data Scraper Attack**: A malicious client issues a blanket query trying to find admin configs.
5. **Denial of Wallet Payload**: Attempting to upload a message containing a 5MB string to exhaust database quotas.
6. **Malicious ID Poisoning**: Ingress attempts with toxic document IDs like `/messages/..%2F..%2Fsys_config` or junk-character strings.
7. **Bypassing Verification State**: A client attempts to write config parameters with unverified credentials.
8. **Negative Size Allocation**: Assigning negative attachments count or corrupted file sizes.
9. **Temporal Desynchronization**: Providing local timestamps from next month/year instead of server timestamps.
14. **Direct Channel Hijack**: A client updates the verified Discord bot channel configuration in `config` to intercept traffic from other servers.
11. **Log Manipulation**: Trying to delete system logs or clear audit history without authorization.
12. **Truncated Attachment Forgery**: Submitting attachment objects lacking valid media URLs or IDs.

The database security definitions guarantee that these actions result in absolute denial.
