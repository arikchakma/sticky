import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: App,
});

function App() {
  return (
    <div className="App">
      <h1>Hello World</h1>
    </div>
  );
}
