---
name: performance-optimizer
description: Analyzes and fixes performance issues like excessive setData, unoptimized lists, and slow cloud functions. Use when user mentions "slow", "laggy", "performance", "optimize", or "improve speed".
---

# Performance Optimization Engine

Automatically detects and fixes common performance bottlenecks.

## When to use this skill

- User says: "app is slow", "page is laggy", "optimize performance"
- Keywords: slow, lag, freeze, optimize, performance, speed

## Performance Checks

### 1. setData Optimization

**Issue: Frequent calls**
```javascript
// ❌ Before
this.setData({a: 1});
this.setData({b: 2});
this.setData({c: 3});

// ✅ After
this.setData({a: 1, b: 2, c: 3});
```

**Issue: Large data**
```javascript
// ❌ Before
this.setData({list: newList});

// ✅ After
this.setData({
  [`list[${index}].name`]: newName
});
```

### 2. List Rendering

```xml
<!-- ❌ Before -->
<view wx:for="{{longList}}">{{item}}</view>

<!-- ✅ After -->
<scroll-view type="list" enable-flex scroll-y>
  <view wx:for="{{longList}}" wx:key="id">{{item}}</view>
</scroll-view>
```

### 3. Image Optimization

```xml
<!-- ❌ Before -->
<image src="{{url}}" />

<!-- ✅ After -->
<image src="{{url}}" lazy-load mode="aspectFill" webp />
```

## Output

- Performance analysis report
- List of auto-fixed files
- Manual fix recommendations
- Expected performance gains
