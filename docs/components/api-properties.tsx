import library from '@/lib/generated/library.json';

type Property = { name: string; optional: boolean; type: string; description: string; deprecated: unknown };
type Interface = { extends: string[]; properties: Property[] };
const interfaces = library.interfaces as Record<string, Interface>;
function propertiesFor(name: string): Property[] {
  const entry = interfaces[name];
  if (!entry) return [];
  return [...entry.extends.flatMap(propertiesFor), ...entry.properties];
}
export function ApiProperties({ name }: { name: string }) {
  return <div className="api-properties">{propertiesFor(name).map((prop) => (
    <section key={prop.name} id={'prop-' + prop.name} className="api-property">
      <div className="api-property-heading"><code>{prop.name}</code><span className="api-tag">{prop.optional ? 'optional' : 'required'}</span>{!!prop.deprecated && <span className="api-tag api-deprecated">deprecated</span>}</div>
      <code className="api-type">{prop.type}</code>
      {prop.description && <p>{prop.description}</p>}
      {!!prop.deprecated && <p className="api-deprecated">{String(prop.deprecated)}</p>}
    </section>
  ))}</div>;
}
export function CompatibilityTable() {
  return <table><thead><tr><th>Dependency</th><th>Requirement</th></tr></thead><tbody>
    {Object.entries(library.peerDependencies).map(([name, version]) => <tr key={name}><td><code>{name}</code>{library.optionalPeers.includes(name) && ' (optional)'}</td><td><code>{version}</code></td></tr>)}
  </tbody></table>;
}
