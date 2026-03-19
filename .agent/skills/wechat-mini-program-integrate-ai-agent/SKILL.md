---
name: wechat-mini-program-integrate-ai-agent
description: "Integrate WeChat Cloud AI Agent messaging with bot setup, streaming responses, and optional cloud-function wrappers. Use when implementing AI chat, bot interactions, DeepSeek-style assistants, or LLM features in mini programs."
---

# AI Agent Integration

Integrates the official WeChat Cloud AI+ capability (Agent).

## When to use this skill

- User says: "add AI chat", "integrate agent", "use DeepSeek", "create bot"
- Keywords: AI, Agent, Bot, LLM, Cloud Capability

## Implementation

### Step 1: Client Side Integration (Frontend)

```javascript
// In your page or component
const { AI } = wx.cloud.extend;

Component({
  methods: {
    async sendMessage(text) {
      try {
        const res = await AI.bot.sendMessage({
          botId: 'YOUR_BOT_ID', // Get from WeChat Cloud Console
          msg: text,
          history: this.data.history || [] // Optional chat history
        });

        // Handle stream response or text response
        for await (const chunk of res.eventStream) {
           console.log(chunk); 
           // Update UI with chunk.text
        }
      } catch (error) {
        console.error('AI Error:', error);
      }
    }
  }
});
```

### Step 2: Configuration

Ensure your `project.config.json` or `app.json` has cloud enabled.

### Step 3: Cloud Function (Optional Wrapper)

If you need backend security or preprocessing:

```javascript
// cloudfunctions/askAgent/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { AI } = cloud.extend;
  const res = await AI.bot.sendMessage({
    botId: 'YOUR_BOT_ID',
    msg: event.text
  });
  return res;
};
```

## Important rules

- ✅ Requires WeChat Lib 3.7.1+
- ✅ Get Bot ID from WeChat Developers Tool -> Cloud -> AI Agents
- ✅ Streaming is supported via `eventStream`
