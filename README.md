# REX Cognitive Engine — MCP Setup

## Add to your MCP config (settings.json):

```json
{
  "rex-cognitive": {
    "command": "node",
    "args": ["D:/PHANTOM-OPS/rex-cognitive-engine/dist/index.js"],
    "transportType": "stdio"
  }
}
```

## Tools Available

### 1. `rex_think` — Main reasoning tool
### 2. `rex_session_summary` — Get session overview  
### 3. `rex_reset_session` — Clear session state
