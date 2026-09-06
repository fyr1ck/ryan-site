import { AlertTriangle } from 'lucide-react'

/**
 * Tela mostrada quando faltam as variáveis de ambiente públicas.
 *
 * Substitui o 500 genérico que o erro do client do Supabase provocaria. Diz
 * exatamente qual variável falta e onde preenchê-la — quem vê esta tela é
 * quem acabou de publicar, e precisa de instrução, não de "server error".
 */
export function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: '#09090b',
          color: '#fafafa',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          lineHeight: 1.6,
        }}
      >
        <main style={{ maxWidth: '38rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <AlertTriangle style={{ width: 28, height: 28, color: '#f59e0b' }} aria-hidden />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
              Falta configurar a loja
            </h1>
          </div>

          <p style={{ color: '#a1a1aa', marginTop: 0 }}>
            O site subiu, mas não consegue falar com o banco de dados porque estas
            variáveis de ambiente não foram definidas:
          </p>

          <ul
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '0.65rem',
              padding: '1rem 1rem 1rem 2.25rem',
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.9rem',
            }}
          >
            {missing.map((nome) => (
              <li key={nome} style={{ marginBottom: '0.25rem' }}>
                {nome}
              </li>
            ))}
          </ul>

          <p style={{ color: '#a1a1aa' }}>
            Na Vercel: <strong style={{ color: '#fafafa' }}>Settings → Environment
            Variables</strong>, adicione cada uma marcando os três ambientes
            (Production, Preview, Development). Depois vá em{' '}
            <strong style={{ color: '#fafafa' }}>Deployments</strong>, abra o
            último e use <strong style={{ color: '#fafafa' }}>Redeploy</strong> —
            variável nova só vale para builds feitos depois dela.
          </p>

          <p style={{ color: '#71717a', fontSize: '0.85rem', marginBottom: 0 }}>
            Os valores estão no <code>.env.example</code> do repositório e no
            painel do Supabase, em Project Settings → API.
          </p>
        </main>
      </body>
    </html>
  )
}
