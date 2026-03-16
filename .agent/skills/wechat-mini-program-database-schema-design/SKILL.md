---
name: wechat-mini-program-database-schema-design
description: "Design CloudBase data models with collection schema strategy, permission rules, indexes, and CRUD templates. Use when defining backend data structures, modeling entities, creating collections, or planning secure database operations."
---

# Database Schema Designer

Automatically designs optimized database schemas for WeChat Cloud Base.

## When to use this skill

- User says: "create database", "design schema", "need data model"
- Keywords: database, collection, schema, data, model, store

## Schema Template

```json
{
  "_id": "auto",
  "_openid": "string (auto)",
  "title": {
    "type": "string",
    "required": true,
    "maxLength": 100
  },
  "content": {
    "type": "string",
    "required": true
  },
  "status": {
    "type": "number",
    "enum": [0, 1, 2],
    "default": 0
  },
  "created_at": {
    "type": "date",
    "default": "$serverDate"
  }
}
```

## Permission Rules

```json
{
  "read": "doc._openid == auth.openid || doc.status == 1",
  "write": "doc._openid == auth.openid",
  "create": true,
  "delete": "doc._openid == auth.openid"
}
```

## CRUD Cloud Function Template

```javascript
const cloud = require('wx-server-sdk');
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  
  const data = {
    ...event.data,
    _openid: wxContext.OPENID,
    created_at: db.serverDate()
  };
  
  return await db.collection('posts').add({data});
};
```

## Important rules

- ⚠️ NEVER let frontend pass openid
- ✅ ALWAYS use atomic operations
- ✅ Add indexes for frequently queried fields
