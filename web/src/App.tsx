import { DevConsole } from './dev/DevConsole';
import { Shell } from './ui/Shell';
export default function App() { return new URLSearchParams(location.search).has('dev') ? <DevConsole/> : <Shell/>; }
