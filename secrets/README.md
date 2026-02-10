# Shalom Realm Secrets

This directory contains SOPS-encrypted secrets for the Realm project.

## Files

- `moltbook.json` - Moltbook API credentials
- `realm-api.json` - Realm API secret key

## Decrypting

```bash
# Decrypt to stdout
sops -d secrets/moltbook.json

# Decrypt specific field
sops -d secrets/moltbook.json | jq -r '.api_key'
```

## Editing

```bash
# Edit encrypted file (auto-encrypts on save)
sops secrets/moltbook.json
```

## Environment Setup

Ensure your Age key is available:
```bash
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/key.txt"
```
