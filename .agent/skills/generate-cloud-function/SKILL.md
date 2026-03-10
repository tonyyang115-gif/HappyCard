---
name: generate-cloud-function
description: Generates complete cloud functions with the required trinity files (index.js, package.json, config.json). Use when user needs backend logic or server-side operations.
---

# Cloud Function Generator

Automatically creates production-ready cloud functions.

## When to use this skill

- User says: "create cloud function", "backend logic", "server-side code"
- Keywords: cloud function, API, backend, server, database operation

## The Trinity Files

Every cloud function MUST have 3 files:

1. **index.js** - Main logic
2. **package.json** - Dependencies
3. **config.json** - Permissions ⚠️ CRITICAL

## Templates

### Database CRUD

```javascript
// index.js
const cloud = require('wx-server-sdk');
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  
  const data = {
    ...event.data,
    _openid: wxContext.OPENID,  // ✅ Secure
    created_at: db.serverDate()
  };
  
  try {
    const result = await db.collection('posts').add({data});
    return {success: true, id: result._id};
  } catch (err) {
    return {success: false, error: err.message};
  }
};
```

### OpenAPI (Content Check)

```javascript
// index.js
exports.main = async (event) => {
  const {content} = event;
  
  const result = await cloud.openapi.security.msgSecCheck({
    content,
    version: 2,
    scene: 2,
    openid: cloud.getWXContext().OPENID
  });
  
  if (result.result.suggest === 'risky') {
    return {success: false, error: 'content_risky'};
  }
  
  return {success: true};
};
```

```json
// config.json - REQUIRED for OpenAPI
{
  "permissions": {
    "openapi": ["security.msgSecCheck"]
  },
  "timeout": 15
}
```

## Important rules

- ⚠️ NEVER trust frontend openid (get from cloud.getWXContext())
- ✅ ALWAYS use atomic operations
- ✅ ALWAYS validate input
- ❌ NEVER forget config.json when using OpenAPI
