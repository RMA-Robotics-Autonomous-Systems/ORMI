# WebSocket Provider

A comprehensive React WebSocket provider with reconnection, timeout handling, and error management.

## Features

- **Automatic Connection Management**: Connects automatically on mount
- **Reconnection Logic**: Configurable reconnection attempts with exponential backoff
- **Timeout Handling**: Connection timeout with customizable duration
- **Error Handling**: Distinguishes between connection errors and message errors
- **Status Indicators**: Visual feedback with loading spinners and error states
- **Type Safety**: Full TypeScript support with typed message handling
- **React Integration**: Uses React Context for state management

## Basic Usage

```tsx
import { WebSocketProvider, useWebSocket } from "@ormi/utils";

function App() {
  return (
    <WebSocketProvider
      url="ws://localhost:8080"
      timeout={5000}
      reconnectAttempts={3}
      reconnectInterval={2000}
    >
      <YourComponent />
    </WebSocketProvider>
  );
}

function YourComponent() {
  const { sendMessage, isConnected, status } = useWebSocket();

  const handleSendMessage = () => {
    if (isConnected) {
      sendMessage("Hello WebSocket!");
    }
  };

  return (
    <div>
      <p>Status: {status}</p>
      <button onClick={handleSendMessage} disabled={!isConnected}>
        Send Message
      </button>
    </div>
  );
}
```

## Advanced Usage with Typed Messages

```tsx
import { WebSocketProvider, useWebSocketMessages } from "@ormi/utils";

interface ChatMessage {
  type: "chat";
  user: string;
  message: string;
  timestamp: number;
}

function ChatComponent() {
  const { sendTypedMessage, isConnected } = useWebSocketMessages<ChatMessage>();

  const sendChatMessage = (message: string) => {
    sendTypedMessage({
      type: "chat",
      user: "currentUser",
      message,
      timestamp: Date.now(),
    });
  };

  return <div>{/* Your chat UI */}</div>;
}
```

## Props

### WebSocketProvider Props

| Prop                | Type                              | Default     | Description                                         |
| ------------------- | --------------------------------- | ----------- | --------------------------------------------------- |
| `url`               | `string`                          | required    | WebSocket URL to connect to                         |
| `protocols`         | `string \| string[]`              | `undefined` | WebSocket protocols                                 |
| `timeout`           | `number`                          | `5000`      | Connection timeout in milliseconds                  |
| `reconnectAttempts` | `number`                          | `5`         | Maximum number of reconnection attempts             |
| `reconnectInterval` | `number`                          | `3000`      | Delay between reconnection attempts in milliseconds |
| `onMessage`         | `(event: MessageEvent) => void`   | `undefined` | Message event handler                               |
| `onError`           | `(error: WebSocketError) => void` | `undefined` | Error event handler                                 |
| `onOpen`            | `(event: Event) => void`          | `undefined` | Connection open event handler                       |
| `onClose`           | `(event: CloseEvent) => void`     | `undefined` | Connection close event handler                      |

### useWebSocket Hook Returns

| Property               | Type                     | Description                           |
| ---------------------- | ------------------------ | ------------------------------------- |
| `socket`               | `WebSocket \| null`      | Raw WebSocket instance                |
| `status`               | `WebSocketStatus`        | Current connection status             |
| `isConnected`          | `boolean`                | Whether the connection is established |
| `isConnecting`         | `boolean`                | Whether currently connecting          |
| `isReconnecting`       | `boolean`                | Whether currently reconnecting        |
| `error`                | `WebSocketError \| null` | Current error state                   |
| `reconnectAttempt`     | `number`                 | Current reconnection attempt number   |
| `maxReconnectAttempts` | `number`                 | Maximum reconnection attempts         |
| `sendMessage`          | `function`               | Send a message through the WebSocket  |
| `connect`              | `function`               | Manually trigger connection           |
| `disconnect`           | `function`               | Manually disconnect                   |
| `clearError`           | `function`               | Clear the current error state         |

## WebSocket Status

The provider tracks the following statuses:

- `CONNECTING`: Initial connection attempt
- `CONNECTED`: Successfully connected
- `DISCONNECTED`: Disconnected (manual or after max retries)
- `RECONNECTING`: Attempting to reconnect
- `ERROR`: Connection or operation error

## Error Types

The provider distinguishes between different error types:

- `connection`: Network or connection-related errors
- `timeout`: Connection timeout errors
- `message`: Message sending errors
- `unknown`: Unclassified errors

## Visual Feedback

The provider automatically shows status overlays for:

- **Loading States**: Spinner during connection/reconnection
- **Error States**: Error icon with error message
- **Reconnection Progress**: Shows current attempt number

The overlay appears in the top-right corner and automatically hides when connected or disconnected.

## Error Handling Strategy

The provider handles WebSocket-inherent errors automatically:

- **Connection errors**: Triggers reconnection logic
- **Timeout errors**: Treats as connection failure
- **Network errors**: Automatic reconnection

Application-specific errors should be handled in your `onError` callback or by checking the `error` state in your components.

## Best Practices

1. **Handle Connection States**: Always check `isConnected` before sending messages
2. **Error Boundaries**: Wrap your components in error boundaries for graceful degradation
3. **Message Queuing**: Consider implementing message queuing for offline scenarios
4. **Type Safety**: Use `useWebSocketMessages` for typed message handling
5. **Cleanup**: The provider automatically cleans up connections on unmount

## Example: Complete Chat Implementation

See `websocket-example.tsx` for a complete implementation example with chat functionality and status monitoring.
