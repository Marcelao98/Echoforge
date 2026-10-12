// O guia da forja. Trocar o nome do personagem é trocar aqui.

export const PERSONA = {
  nome: 'Mestre Tímbrio',
  titulo: 'o Forjador de Vozes',
  saudacao:
    'Bem-vindo à minha forja, viajante! Aqui a gente derrete a sua voz e martela até virar a de outra criatura. Acende a forja ali em cima pra começar.',
  falas: {
    forjaAcesa: 'A brasa pegou! Fala alguma coisa e olha as cores dançando. Cada nota tem a sua.',
    semMicrofone: 'Hmm, a forja não achou microfone nenhum. Confere se o navegador deixou eu ouvir você.',
    forjaApagada: 'Forja apagada. A sua voz voltou a ser só sua.',
    vozSalva: 'Voz guardada no baú! Ela fica neste navegador.',
    linkCopiado: 'Link copiado. Quem abrir ganha essa mesma voz, sem precisar de nada.',
    vozImportada: 'Voz importada! Já tá na bigorna.',
    vozInvalida: 'Isso aí não é uma voz que eu reconheça. Confere o arquivo.',
    gravando: 'Gravando! Fala aí que eu guardo uns segundos pra você se ouvir.',
    gravacaoPronta: 'Pronto. Aperta o play e escuta como a sua voz saiu da forja.',
    zerado: 'Bigorna limpa. Voz crua, do jeito que nasceu.',
    microfoneAlto: 'Opa, tá estourando! Abaixa o Ganho do Fole um pouco.',
    retornoSemFone: 'Cuidado: sem fone de ouvido, o retorno faz a voz entrar no microfone de novo e apitar.',
  },
  tour: [
    { alvo: '#acender', texto: 'Primeiro, acende a forja. O navegador vai pedir pra eu ouvir o seu microfone.' },
    { alvo: '#vozes', texto: 'Aqui ficam as vozes prontas. Clica numa e a bigorna se ajusta sozinha.' },
    { alvo: '#visor', texto: 'Esse é o visor. Em cima, a voz crua. Embaixo, a voz forjada. Cada nota pinta a sua cor.' },
    { alvo: '#roda', texto: 'A roda das notas mostra qual nota você tá falando agora, e a aura cresce com o volume.' },
    { alvo: '#mesa', texto: 'E essa é a minha mesa. Tom e Timbre na Garganta são o coração. O resto é tempero.' },
    { alvo: '#saidas', texto: 'Pra usar no Discord, escolhe aqui a saída do cabo virtual. O guia tá no README.' },
  ],
} as const;
