import { CopyButton } from './copy-button';
const snippet = [
  "import { Tabs } from 'react-native-collapsible-fluid-tabs/core';",
  '', 'export function ProfileScreen() {', '  return (',
  '    <Tabs.Container renderHeader={() => <ProfileHeader />}>',
  '      <Tabs.Tab name="posts" label="Posts">',
  '        <Tabs.FlatList', '          data={posts}',
  '          renderItem={({ item }) => <Post item={item} />}',
  '          keyExtractor={(item) => item.id}', '        />',
  '      </Tabs.Tab>', '      <Tabs.Tab name="about" label="About">',
  '        <Tabs.ScrollView>', '          <About />',
  '        </Tabs.ScrollView>', '      </Tabs.Tab>',
  '    </Tabs.Container>', '  );', '}',
].join('\n');
export function QuickExample() {
  return <div className="quick-code">
    <div className="code-title"><span className="file-indicator" /><span>ProfileScreen.tsx</span><span className="code-language">React Native</span><CopyButton text={snippet} /></div>
    <pre tabIndex={0} aria-label="React Native profile screen code example"><code>{snippet.split('\n').map((line, index) => <span className="code-line" key={index}><span className="line-number" aria-hidden="true">{index + 1}</span><span className={line.includes('Tabs.') ? 'syntax-component' : line.startsWith('import') || line.startsWith('export') ? 'syntax-keyword' : ''}>{line || ' '}</span>{'\n'}</span>)}</code></pre>
    <div className="code-footnote">Illustrative composition · The quick start includes a complete screen.</div>
  </div>;
}
