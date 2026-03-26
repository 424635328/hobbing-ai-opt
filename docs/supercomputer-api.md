# 国家超算平台模型API集成文档

## 概述

本文档描述了与国家超算平台模型API集成的接口服务，包括请求参数、返回格式、错误码说明等内容。

## 基础配置

### 环境变量

在 `.env` 文件中配置以下环境变量：

```env
SUPERCOMPUTER_API_KEY=sk-NjIyLTEyMzM2OTU5ODI3LTE3NzQ1NDE0NDc4MTc=
SUPERCOMPUTER_API_URL=https://api.supercomputer.gov.cn/v1
SUPERCOMPUTER_TIMEOUT=30000
SUPERCOMPUTER_RATE_LIMIT=100
SUPERCOMPUTER_RATE_LIMIT_WINDOW=60000
```

**配置说明：**
- `SUPERCOMPUTER_API_KEY`: API密钥（必填）
- `SUPERCOMPUTER_API_URL`: API基础URL（默认：https://api.supercomputer.gov.cn/v1）
- `SUPERCOMPUTER_TIMEOUT`: 请求超时时间，单位毫秒（默认：30000）
- `SUPERCOMPUTER_RATE_LIMIT`: 限流阈值，单位次（默认：100）
- `SUPERCOMPUTER_RATE_LIMIT_WINDOW`: 限流窗口，单位毫秒（默认：60000）

## API接口

### 1. 聊天补全接口

**端点：** `POST /api/supercomputer/chat`

**请求参数：**

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| model | string | 是 | 模型名称 |
| prompt | string | 否 | 提示文本（与messages二选一） |
| messages | array | 否 | 消息数组（与prompt二选一） |
| temperature | number | 否 | 温度参数（0-2） |
| max_tokens | number | 否 | 最大token数（1-32000） |
| top_p | number | 否 | top_p参数（0-1） |
| stream | boolean | 否 | 是否流式输出 |
| parameters | object | 否 | 其他自定义参数 |

**消息格式：**
```typescript
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}
```

**请求示例：**

```json
{
  "model": "supercomputer-gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello!"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**成功响应（200 OK）：**

```json
{
  "id": "chatcmpl-12345",
  "object": "chat.completion",
  "created": 1711500000,
  "model": "supercomputer-gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 10,
    "total_tokens": 25
  }
}
```

### 2. 健康检查接口

**端点：** `GET /api/supercomputer/chat`

**请求：** 无需参数

**成功响应（200 OK）：**

```json
{
  "healthy": true,
  "message": "Supercomputer API is healthy",
  "latency": 125,
  "configured": true,
  "timestamp": "2026-03-27T10:00:00.000Z"
}
```

**失败响应（503 Service Unavailable）：**

```json
{
  "healthy": false,
  "message": "API returned status 500",
  "latency": 500,
  "configured": true,
  "timestamp": "2026-03-27T10:00:00.000Z"
}
```

## 错误码说明

| 错误码 | HTTP状态 | 说明 |
|--------|----------|------|
| invalid_request | 400 | 请求参数无效 |
| authentication_failed | 401 | 认证失败 |
| rate_limit_exceeded | 429 | 超过限流阈值 |
| model_not_found | 404 | 模型不存在 |
| invalid_parameter | 400 | 参数无效 |
| timeout | 408 | 请求超时 |
| network_error | 503 | 网络错误 |
| internal_error | 500 | 内部错误 |
| service_unavailable | 503 | 服务不可用 |
| configuration_error | 500 | 配置错误 |
| invalid_content_type | 415 | Content-Type无效 |
| invalid_json | 400 | JSON解析失败 |

**错误响应格式：**

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "model",
        "message": "model is required"
      }
    ]
  }
}
```

## 限流机制

本接口采用滑动窗口限流算法：

- **默认配置：** 100次/分钟
- **限流窗口：** 60秒
- **限流响应：** HTTP 429 Too Many Requests

**限流响应示例：**

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. 50 requests remaining. Reset at 2026-03-27T10:01:00.000Z",
    "details": {
      "remaining": 50,
      "resetTime": 1711500060000,
      "limit": 100,
      "window": 60000
    }
  }
}
```

## 日志记录

所有API请求都会被记录，包含以下信息：

- 请求ID
- 时间戳
- 请求方法
- 端点
- 请求体（可选）
- 响应状态码
- 响应时间
- 错误信息（如适用）

**日志级别：**
- `debug`: 详细调试信息
- `info`: 一般信息
- `warn`: 警告信息
- `error`: 错误信息

## 使用示例

### JavaScript/TypeScript

```typescript
async function callSupercomputerApi() {
  const response = await fetch("/api/supercomputer/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "supercomputer-gpt-4",
      messages: [
        { role: "user", content: "Hello!" }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return await response.json();
}
```

### Python

```python
import requests

def call_supercomputer_api():
    response = requests.post(
        "https://your-domain.com/api/supercomputer/chat",
        json={
            "model": "supercomputer-gpt-4",
            "messages": [
                {"role": "user", "content": "Hello!"}
            ],
            "temperature": 0.7,
        }
    )
    
    if not response.ok:
        error = response.json()
        raise Exception(error["error"]["message"])
    
    return response.json()
```

## 安全最佳实践

1. **API密钥管理：**
   - 永远不要在前端代码中暴露API密钥
   - 使用环境变量管理密钥
   - 定期轮换API密钥

2. **请求验证：**
   - 始终在服务端验证请求参数
   - 不要信任客户端输入

3. **限流保护：**
   - 遵守超算平台的限流规定
   - 实现客户端重试逻辑（带指数退避）

4. **错误处理：**
   - 优雅处理所有可能的错误
   - 提供友好的错误提示

## 可扩展性

本服务设计支持未来集成更多模型服务：

- 模块化架构，各组件独立
- 统一的类型定义和错误处理
- 易于添加新的API端点
- 支持多种限流策略

## 测试

### 单元测试

运行单元测试：
```bash
npm test
```

### 集成测试

运行集成测试：
```bash
npm run test:integration
```

## 支持与反馈

如有问题或建议，请联系开发团队。
