// ==========================================
// 1. VARIÁVEIS GLOBAIS E CONFIGURAÇÃO
// ==========================================
let modoDeJogo = 'PvP';
let dificuldadeBot = 'facil';
let partidaEmAndamento = false;

let casaSelecionada = null;
let lancePromocaoPendente = null;

var board = null;
var game = new Chess();
var statusEl = $('#statusJogo');

// ==========================================
// 2. LÓGICA DE INTERFACE E MODO ESCURO
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebarConfig');
    const overlay = document.getElementById('sidebarOverlay');
    const btnHamburger = document.getElementById('btnHamburger');
    const isOpen = sidebar.classList.toggle('open');

    overlay.style.display = isOpen ? 'block' : 'none';
    sidebar.setAttribute('aria-hidden', String(!isOpen));
    btnHamburger.setAttribute('aria-expanded', String(isOpen));
    btnHamburger.setAttribute('aria-label', isOpen ? 'Fechar configurações' : 'Abrir configurações');
}

function toggleAjuda() {
    const modal = document.getElementById('modalAjuda');
    const visivel = modal.style.display === 'flex';
    modal.style.display = visivel ? 'none' : 'flex';
}

function alternarTema() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('btnTema').innerHTML = isDark
        ? '<i class="ph ph-sun"></i> Tema Claro'
        : '<i class="ph ph-moon"></i> Modo Escuro';
    localStorage.setItem('temaEscuro', isDark);
}

window.onload = () => {
    if (localStorage.getItem('temaEscuro') === 'true') {
        document.body.classList.add('dark-mode');
        document.getElementById('btnTema').innerHTML = '<i class="ph ph-sun"></i> Tema Claro';
    }

    // Avisar se o navegador não suporta voz
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        document.getElementById('avisoMicrofone').style.display = 'flex';
    }
};

// ==========================================
// 3. TABULEIRO VISUAL E ANIMAÇÕES
// ==========================================
var config = {
    draggable: true,
    position: 'start',
    onDragStart: aoPegarPeca,
    onDrop: aoSoltarPeca,
    onSnapEnd: function () {
        board.position(game.fen());
    },
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
};
board = Chessboard('meuTabuleiro', config);

function removerDestaques() {
    $('#meuTabuleiro .square-55d63').removeClass('highlight-selected highlight-target');
}

function destacarCasasPossiveis(square) {
    removerDestaques();
    $('#meuTabuleiro .square-' + square).addClass('highlight-selected');
    var lancesPossiveis = game.moves({ square: square, verbose: true });
    for (var i = 0; i < lancesPossiveis.length; i++) {
        $('#meuTabuleiro .square-' + lancesPossiveis[i].to).addClass('highlight-target');
    }
}

// ---------------------------------------------------------
// LÓGICA DE EXECUÇÃO DE LANCE
// ---------------------------------------------------------
function tentarFazerLance(origem, destino, promocaoFixa = null, isDrag = false) {
    var lancesPossiveis = game.moves({ verbose: true });
    var lanceDetalhado = lancesPossiveis.find(l => l.from === origem && l.to === destino);

    if (!lanceDetalhado) return 'snapback';

    const flags = lanceDetalhado.flags || '';
    if (!promocaoFixa && (flags.includes('p') || flags.includes('cp') || flags.includes('np'))) {
        lancePromocaoPendente = { from: origem, to: destino, isDrag: isDrag };
        document.getElementById('modalPromocao').style.display = 'flex';
        // Anunciar por voz para acessibilidade
        falarTexto("Escolha a peça para promoção do peão.");
        return 'snapback';
    }

    return executarLanceFinal(origem, destino, promocaoFixa || 'q', isDrag);
}

function efetuarPromocao(pecaEscolhida) {
    document.getElementById('modalPromocao').style.display = 'none';
    if (lancePromocaoPendente) {
        executarLanceFinal(lancePromocaoPendente.from, lancePromocaoPendente.to, pecaEscolhida, false);
        lancePromocaoPendente = null;
    }
}

function cancelarPromocao() {
    document.getElementById('modalPromocao').style.display = 'none';
    lancePromocaoPendente = null;
    casaSelecionada = null;
    removerDestaques();
}

function executarLanceFinal(origem, destino, pecaPromocao, isDrag = false) {
    var lance = game.move({ from: origem, to: destino, promotion: pecaPromocao });
    if (lance === null) return 'snapback';

    removerDestaques();
    casaSelecionada = null;
    atualizarStatus();

    if (!isDrag) {
        setTimeout(() => board.position(game.fen(), true), 10);
    }

    window.setTimeout(pedirLanceAoStockfish, 500);
    return lance;
}

// ---------------------------------------------------------
// CLIQUE DO MOUSE
// ---------------------------------------------------------
$('#meuTabuleiro').on('click', '.square-55d63', function (e) {
    if (!partidaEmAndamento || game.game_over()) return;
    if (modoDeJogo === 'PvE' && game.turn() === 'b') return;

    var squareClicado = $(this).attr('data-square');
    var pecaNoSquare = game.get(squareClicado);

    if (casaSelecionada !== null && casaSelecionada !== squareClicado) {
        var lancesPossiveis = game.moves({ square: casaSelecionada, verbose: true });
        var ehLanceValido = lancesPossiveis.find(l => l.to === squareClicado);

        if (ehLanceValido) {
            tentarFazerLance(casaSelecionada, squareClicado, null, false);
            e.preventDefault();
        } else {
            if (pecaNoSquare !== null && pecaNoSquare.color === game.turn()) {
                casaSelecionada = squareClicado;
                destacarCasasPossiveis(squareClicado);
            } else {
                casaSelecionada = null;
                removerDestaques();
            }
        }
    } else {
        if (pecaNoSquare !== null && pecaNoSquare.color === game.turn()) {
            casaSelecionada = squareClicado;
            destacarCasasPossiveis(squareClicado);
        }
    }
});

// ---------------------------------------------------------
// ARRASTAR E SOLTAR
// ---------------------------------------------------------
function aoPegarPeca(origem, peca) {
    if (!partidaEmAndamento || game.game_over()) return false;
    if ((game.turn() === 'w' && peca.search(/^b/) !== -1) ||
        (game.turn() === 'b' && peca.search(/^w/) !== -1)) return false;

    casaSelecionada = origem;
    destacarCasasPossiveis(origem);
}

function aoSoltarPeca(origem, destino) {
    if (origem === destino) return;
    return tentarFazerLance(origem, destino, null, true);
}

// ---------------------------------------------------------
// STATUS & HISTÓRICO
// ---------------------------------------------------------
function atualizarStatus() {
    if (!partidaEmAndamento) return;

    var vezDasBrancas = (game.turn() === 'w');
    var corJogadora = vezDasBrancas ? 'Brancas' : 'Pretas';
    var status = '';

    if (game.in_checkmate()) {
        status = 'Fim de jogo: ' + corJogadora + ' sofreram Xeque-Mate!';
        partidaEmAndamento = false;
        document.getElementById('btnGravar').disabled = true;
        falarTexto('Fim de jogo. ' + corJogadora + ' sofreram Xeque-Mate!');
        setTimeout(analisarPartida, 800);
    } else if (game.in_draw()) {
        status = 'Fim de jogo: Empate!';
        partidaEmAndamento = false;
        document.getElementById('btnGravar').disabled = true;
        falarTexto('Fim de jogo. A partida terminou em empate.');
        setTimeout(analisarPartida, 800);
    } else {
        status = 'Sua vez, ' + corJogadora + '.';
        if (game.in_check()) {
            status += ' ⚠️ XEQUE!';
            falarTexto('Atenção! Xeque nas ' + corJogadora + '.');
        }
    }

    statusEl.html(status);
    // Atualizar região live para leitores de tela
    document.getElementById('liveRegion').textContent = status.replace('⚠️', '');
    atualizarHistorico();
}

function atualizarHistorico() {
    const el = document.getElementById('historicoLances');
    if (!el) return;
    const h = game.history();

    if (h.length === 0) {
        el.innerHTML = '<p class="historico-vazio"><em>Nenhuma jogada ainda.</em></p>';
        return;
    }

    let html = '';
    for (let i = 0; i < h.length; i += 2) {
        const n = Math.floor(i / 2) + 1;
        html += `<div class="lance-row" role="listitem">
            <span class="lance-num">${n}.</span>
            <span class="lance-w">${h[i]}</span>
            <span class="lance-b">${h[i + 1] || ''}</span>
        </div>`;
    }

    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
}

// ==========================================
// 4. CONFIGURAÇÕES DA PARTIDA
// ==========================================
function atualizarOpcoesDificuldade() {
    const modo = document.getElementById('selectModo').value;
    document.getElementById('divDificuldade').style.display = modo === 'PvE' ? 'block' : 'none';
}

function iniciarPartida() {
    modoDeJogo = document.getElementById('selectModo').value;
    dificuldadeBot = document.getElementById('selectDificuldade').value;

    game.reset();
    board.start();
    partidaEmAndamento = true;
    casaSelecionada = null;
    lancePromocaoPendente = null;
    removerDestaques();

    document.getElementById('btnGravar').disabled = false;
    document.getElementById('btnGravar').setAttribute('aria-pressed', 'false');
    document.getElementById('btnIniciar').innerHTML = '<i class="ph ph-arrows-clockwise"></i> Reiniciar';
    document.getElementById('btnEncerrar').style.display = 'block';
    document.getElementById('resultado').innerHTML = '<em>Fale sua jogada...</em>';

    atualizarStatus();
    document.getElementById('sidebarConfig').classList.remove('open');
    document.getElementById('sidebarOverlay').style.display = 'none';

    // Inicializar engine para resposta mais rápida na primeira jogada
    if (modoDeJogo === 'PvE' && engine) {
        engine.postMessage('ucinewgame');
        engine.postMessage('isready');
    }

    falarTexto('Partida iniciada. É a vez das brancas.');
}

function encerrarPartida() {
    partidaEmAndamento = false;
    casaSelecionada = null;
    removerDestaques();

    document.getElementById('btnGravar').disabled = true;
    document.getElementById('btnIniciar').innerHTML = '<i class="ph ph-play"></i> Iniciar Partida';
    document.getElementById('btnEncerrar').style.display = 'none';
    document.getElementById('resultado').innerHTML = '<em>Inicie a partida primeiro.</em>';

    statusEl.html("Partida encerrada. Configure e inicie novamente.");
    document.getElementById('sidebarConfig').classList.add('open');
    document.getElementById('sidebarOverlay').style.display = 'block';
    falarTexto('Partida encerrada.');
}

// ==========================================
// 5. TRADUTOR DE VOZ → NOTAÇÃO DE XADREZ
// ==========================================

/**
 * Corrige e normaliza o texto falado, extraindo uma notação de xadrez válida.
 * Suporta:
 *   - Roques: "roque menor/maior/curto/longo"
 *   - Números por extenso: "um" → "1", etc.
 *   - Fonética: "de 5" → "d5", "ce 4" → "c4"
 *   - Peças em português: rei, dama, torre, bispo, cavalo
 *   - Capturas: toma, come, mata, captura
 *   - Notação de coordenadas: "e dois e quatro" → "e2e4"
 */
function traduzirVozParaLance(textoFalado) {
    let texto = textoFalado.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // remove acentos

    // --- Roques ---
    if (/roque\s*(menor|curto)/.test(texto))  return "O-O";
    if (/roque\s*(maior|longo|grande)/.test(texto)) return "O-O-O";

    // --- 1. Converter números por extenso ---
    const numeros = {
        "um": "1", "dois": "2", "tres": "3", "quatro": "4",
        "cinco": "5", "seis": "6", "sete": "7", "oito": "8"
    };
    for (const [extenso, numero] of Object.entries(numeros)) {
        texto = texto.replace(new RegExp('\\b' + extenso + '\\b', 'g'), numero);
    }

    // --- 2. Corrigir fonéticas comuns antes de extrair coordenadas ---
    // Letras que o reconhecimento confunde com palavras
    const foneticas = [
        [/\b(de|de)\s*([1-8])/gi,       'd$2'],
        [/\b(ce|ce|se|se)\s*([1-8])/gi, 'c$2'],
        [/\b(be|be)\s*([1-8])/gi,       'b$2'],
        [/\b(efe|efe)\s*([1-8])/gi,     'f$2'],
        [/\b(ge|ge|je)\s*([1-8])/gi,    'g$2'],
        [/\b(aga|aga|haga)\s*([1-8])/gi,'h$2'],
        [/\bser\s*([1-8])/gi,           'c$1'],  // "ser 4" → "c4"
        [/\bea\s*([1-8])/gi,            'a$1'],  // "ea4" → "a4"
    ];
    for (const [regex, subst] of foneticas) {
        texto = texto.replace(regex, subst);
    }

    // --- 3. Detectar peça nomeada ---
    let peca = "";
    if (/\brei\b/.test(texto))                          peca = "K";
    else if (/\b(dama|rainha)\b/.test(texto))           peca = "Q";
    else if (/\btorre\b/.test(texto))                   peca = "R";
    else if (/\bbispo\b/.test(texto))                   peca = "B";
    else if (/\bcavalo\b/.test(texto))                  peca = "N";
    // peão / pião = sem letra

    // --- 4. Detectar captura ---
    const ehCaptura = /\b(captura|come|toma|mata|x)\b/.test(texto);

    // --- 5. Extrair todas as coordenadas [a-h][1-8] do texto ---
    const coordenadas = texto.match(/[a-h][1-8]/g) || [];

    // --- 6. Montar a jogada ---
    if (coordenadas.length >= 2) {
        const origem  = coordenadas[0];
        const destino = coordenadas[1];

        if (peca && ehCaptura)  return peca + "x" + destino;          // Nx e5 → Nxe5
        if (!peca && ehCaptura) return origem.charAt(0) + "x" + destino; // peão dxc4
        if (peca)               return peca + destino;                 // Nf3
        return origem + destino;                                        // e2e4

    } else if (coordenadas.length === 1) {
        const destino = coordenadas[0];
        if (ehCaptura) return peca + "x" + destino;
        return peca + destino;                                          // e4, Nf3
    }

    // Último recurso: retornar texto limpo
    return texto.replace(/[^a-z0-9\-]/g, '');
}

// ==========================================
// 6. CONSULTA POR VOZ (ACESSIBILIDADE)
// ==========================================
function informarStatusPorVoz() {
    if (!partidaEmAndamento) {
        falarTexto("Nenhuma partida em andamento no momento.");
        return;
    }

    var corJogadora = game.turn() === 'w' ? 'brancas' : 'pretas';
    var frase = '';

    if (game.in_checkmate()) {
        frase = "Fim de jogo. Xeque-mate nas " + corJogadora + ".";
    } else if (game.in_draw()) {
        frase = "Fim de jogo. A partida terminou em empate.";
    } else if (game.in_check()) {
        frase = "É a vez das " + corJogadora + ". Atenção, o rei está em xeque!";
    } else {
        const totalLances = game.history().length;
        frase = "É a vez das " + corJogadora + ". " +
                "Lance número " + (Math.floor(totalLances / 2) + 1) + ". " +
                "O jogo está ocorrendo normalmente.";
    }

    falarTexto(frase);
}

// ==========================================
// 7. RECONHECIMENTO DE VOZ (MICROFONE)
// ==========================================
const btnGravar    = document.getElementById('btnGravar');
const divResultado = document.getElementById('resultado');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang            = 'pt-BR';
    recognition.continuous      = false;
    recognition.interimResults  = false;
    recognition.maxAlternatives = 3; // Pegar até 3 transcrições alternativas

    let estaGravando = false;

    btnGravar.addEventListener('click', () => {
        if (!partidaEmAndamento) return;
        if (!estaGravando) {
            try {
                recognition.start();
            } catch (e) {
                // Já estava rodando — ignorar
            }
        } else {
            recognition.stop();
        }
    });

    recognition.onstart = () => {
        estaGravando = true;
        btnGravar.innerHTML = '<i class="ph ph-stop-circle"></i> Parar Escuta';
        btnGravar.classList.add('gravando');
        btnGravar.setAttribute('aria-pressed', 'true');
        divResultado.textContent = "🎙️ Ouvindo...";
    };

    recognition.onresult = (event) => {
        // Tentar todas as alternativas até uma funcionar
        const alternativas = [];
        for (let i = 0; i < event.results[0].length; i++) {
            alternativas.push(event.results[0][i].transcript);
        }

        const textoFalado = alternativas[0]; // melhor candidato

        // --- Consulta de status ---
        const textoNorm = textoFalado.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (/\b(status|situacao|quem joga|quem e a vez)\b/.test(textoNorm)) {
            informarStatusPorVoz();
            divResultado.innerHTML = `"<em>${textoFalado}</em>"<br>
                <span style="color:var(--info);">ℹ️ Lendo status...</span>`;
            return;
        }

        // --- Tentar cada alternativa ---
        let lance = null;
        let lanceTraduzido = '';

        for (const alt of alternativas) {
            lanceTraduzido = traduzirVozParaLance(alt);

            // Prioridade 1: Notação SAN ("Nf3", "e4", "dxc4", "O-O")
            lance = game.move(lanceTraduzido);
            if (lance !== null) break;

            // Prioridade 2: Coordenadas diretas ("e2e4")
            if (/^[a-h][1-8][a-h][1-8]$/.test(lanceTraduzido)) {
                lance = game.move({
                    from: lanceTraduzido.substring(0, 2),
                    to:   lanceTraduzido.substring(2, 4),
                    promotion: 'q'
                });
                if (lance !== null) break;
            }
        }

        if (lance === null) {
            // Dar feedback mais útil: sugerir o que foi entendido
            const dica = gerarDicaErro(textoFalado, lanceTraduzido);
            divResultado.innerHTML = `"<em>${textoFalado}</em>"<br>
                <span style="color:var(--danger);">✗ Lance inválido: <strong>${lanceTraduzido}</strong></span><br>
                <span class="dica-voz">${dica}</span>`;
            falarTexto("Lance inválido. " + dica.replace(/<[^>]+>/g, ''));
        } else {
            board.position(game.fen(), true);
            casaSelecionada = null;
            removerDestaques();
            atualizarStatus();
            divResultado.innerHTML = `"<em>${textoFalado}</em>"<br>
                <span style="color:var(--accent);">✓ Jogada: <strong>${lance.san}</strong></span>`;
            window.setTimeout(pedirLanceAoStockfish, 500);
        }
    };

    recognition.onerror = (event) => {
        estaGravando = false;
        btnGravar.innerHTML = '<i class="ph ph-microphone"></i> Falar Jogada';
        btnGravar.classList.remove('gravando');
        btnGravar.setAttribute('aria-pressed', 'false');

        // Mensagens de erro amigáveis por tipo
        const erros = {
            'not-allowed':   '🔒 Permissão de microfone negada. Clique no ícone de cadeado na barra do navegador e permita o microfone.',
            'no-speech':     '🔇 Nenhuma fala detectada. Fale mais alto e tente novamente.',
            'audio-capture': '🎙️ Microfone não encontrado. Verifique se está conectado.',
            'network':       '🌐 Erro de rede. Verifique sua conexão com a internet.',
            'aborted':       '⏹️ Reconhecimento cancelado.',
            'service-not-allowed': '🔒 Serviço de voz bloqueado. Tente em uma conexão HTTPS.',
        };

        const msg = erros[event.error] || `❌ Erro: ${event.error}. Tente novamente.`;
        divResultado.innerHTML = `<span style="color:var(--danger);">${msg}</span>`;

        // Falar apenas erros relevantes (não o "aborted" que é intencional)
        if (event.error !== 'aborted') {
            falarTexto(erros[event.error]
                ? erros[event.error].replace(/[🔒🔇🎙️🌐⏹️❌]/g, '')
                : 'Erro no microfone. Tente novamente.');
        }
    };

    recognition.onend = () => {
        estaGravando = false;
        btnGravar.innerHTML = '<i class="ph ph-microphone"></i> Falar Jogada';
        btnGravar.classList.remove('gravando');
        btnGravar.setAttribute('aria-pressed', 'false');
    };

} else {
    // Navegador não suporta — desabilitar botão e exibir aviso
    btnGravar.disabled = true;
    btnGravar.title = 'Reconhecimento de voz não suportado neste navegador';
    document.getElementById('avisoMicrofone').style.display = 'flex';
}

/**
 * Gera uma dica amigável explicando por que o lance pode ter falhado.
 */
function gerarDicaErro(textoFalado, lanceTraduzido) {
    const lances = game.moves({ verbose: true });

    // Sem lances disponíveis (não deve ocorrer durante o jogo)
    if (lances.length === 0) return 'Nenhum lance disponível no momento.';

    // Verificar se a notação teve apenas 1 coordenada (incompleto)
    const coords = lanceTraduzido.match(/[a-h][1-8]/g) || [];
    if (coords.length === 0) {
        return '💡 Diga <strong>coluna + número</strong>, ex: "e quatro" ou "e dois e quatro".';
    }
    if (coords.length === 1) {
        // Checar se existe algum lance para essa casa de destino
        const casaAlvo = coords[0];
        const possivelLance = lances.find(l => l.to === casaAlvo);
        if (possivelLance) {
            return `💡 Tente especificar a peça: ex. "${nomePecaPT(possivelLance.piece)} ${casaAlvo[0]} ${casaAlvo[1]}".`;
        }
        return `💡 A casa <strong>${casaAlvo}</strong> não é um destino válido agora.`;
    }

    // Duas coordenadas mas lance inválido
    const origem  = coords[0];
    const destino = coords[1];
    const pecaNaOrigem = game.get(origem);

    if (!pecaNaOrigem) {
        return `💡 Não há peça em <strong>${origem}</strong>. Verifique a casa de origem.`;
    }
    if (pecaNaOrigem.color !== game.turn()) {
        return `💡 A peça em <strong>${origem}</strong> não é sua. Aguarde sua vez.`;
    }
    const lancesOrigem = game.moves({ square: origem, verbose: true });
    const temDestino   = lancesOrigem.find(l => l.to === destino);
    if (!temDestino) {
        return `💡 A peça em <strong>${origem}</strong> não pode ir para <strong>${destino}</strong>.`;
    }

    return '💡 Tente falar a jogada devagar: "coluna número coluna número", ex: "e dois e quatro".';
}

/** Traduz a letra da peça do Chess.js para o nome em português */
function nomePecaPT(letra) {
    const nomes = { p: 'peão', n: 'cavalo', b: 'bispo', r: 'torre', q: 'dama', k: 'rei' };
    return nomes[letra] || '';
}

// ==========================================
// 8. INTELIGÊNCIA ARTIFICIAL (STOCKFISH)
// ==========================================
let engine = null;
let enginePronto = false;

fetch('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js')
    .then(response => {
        if (!response.ok) throw new Error('Falha ao carregar Stockfish: ' + response.status);
        return response.text();
    })
    .then(text => {
        const blob = new Blob([text], { type: 'application/javascript' });
        engine = new Worker(URL.createObjectURL(blob));

        engine.onmessage = function (event) {
            const mensagem = event.data;

            if (mensagem === 'readyok') {
                enginePronto = true;
            }

            if (mensagem.startsWith('bestmove')) {
                const lanceUci = mensagem.split(' ')[1];
                if (lanceUci && lanceUci !== '(none)') {
                    fazerLanceComputador(lanceUci);
                }
            }
        };

        engine.onerror = function (e) {
            console.error('Erro no worker do Stockfish:', e);
        };

        // Inicializar engine
        engine.postMessage('uci');
        engine.postMessage('isready');
    })
    .catch(err => {
        console.warn('Stockfish não pôde ser carregado:', err);
        // O jogo ainda funciona em modo PvP; PvE ficará indisponível
        const selectModo = document.getElementById('selectModo');
        for (const opt of selectModo.options) {
            if (opt.value === 'PvE') {
                opt.disabled = true;
                opt.text = 'Humano vs Computador (indisponível)';
            }
        }
    });

function pedirLanceAoStockfish() {
    if (!partidaEmAndamento || modoDeJogo === 'PvP') return;
    if (game.game_over() || game.turn() === 'w') return;
    if (!engine) return;

    statusEl.html("Computador pensando...");

    const configs = {
        facil:  { skill: 0,  depth: 1  },
        medio:  { skill: 10, depth: 5  },
        dificil:{ skill: 20, depth: 12 }
    };
    const cfg = configs[dificuldadeBot] || configs.facil;

    engine.postMessage('setoption name Skill Level value ' + cfg.skill);
    engine.postMessage('position fen ' + game.fen());
    engine.postMessage('go depth ' + cfg.depth);
}

function fazerLanceComputador(lanceUci) {
    const origem       = lanceUci.substring(0, 2);
    const destino      = lanceUci.substring(2, 4);
    const pecaPromocao = lanceUci.length > 4 ? lanceUci.charAt(4) : 'q';

    const lance = game.move({ from: origem, to: destino, promotion: pecaPromocao });
    if (!lance) return; // Segurança: engine retornou lance inválido

    board.position(game.fen());
    atualizarStatus();

    // Anunciar o lance do computador em voz
    const nomePeca = nomePecaPT(lance.piece);
    let anuncio = `Computador jogou ${nomePeca} de ${origem} para ${destino}.`;
    if (lance.captured) anuncio += ` Capturou ${nomePecaPT(lance.captured)}.`;
    if (lance.flags.includes('k')) anuncio = 'Computador fez roque menor.';
    if (lance.flags.includes('q')) anuncio = 'Computador fez roque maior.';

    falarTexto(anuncio);
}

// ==========================================
// 9. SÍNTESE DE VOZ (TEXT-TO-SPEECH)
// ==========================================

// Cache das vozes para evitar chamadas repetidas
let vozesCarregadas = [];

function carregarVozes() {
    vozesCarregadas = window.speechSynthesis.getVoices();
}
carregarVozes();
if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = carregarVozes;
}

function falarTexto(texto) {
    if (!texto || !window.speechSynthesis) return;

    // Cancelar fala anterior para não acumular fila
    window.speechSynthesis.cancel();

    const utterance    = new SpeechSynthesisUtterance(texto);
    utterance.lang     = 'pt-BR';
    utterance.rate     = 1.0;
    utterance.pitch    = 1.0;
    utterance.volume   = 1.0;

    // Escolher a melhor voz disponível em pt-BR
    const voz = vozesCarregadas.find(v => v.name === 'Google português do Brasil') ||
                vozesCarregadas.find(v => v.name.includes('FranciscaOnline') || v.name.includes('AntonioOnline') || v.name.includes('Natural')) ||
                vozesCarregadas.find(v => v.lang === 'pt-BR') ||
                vozesCarregadas.find(v => v.lang.startsWith('pt'));

    if (voz) utterance.voice = voz;

    utterance.onerror = (e) => {
        // Ignorar erros de síntese silenciosamente (não crítico)
        if (e.error !== 'interrupted') console.warn('Erro TTS:', e.error);
    };

    window.speechSynthesis.speak(utterance);
}

// ==========================================
// 10. REVISÃO PÓS-JOGO (ANÁLISE DE PRECISÃO)
// ==========================================

/**
 * Avalia uma posição FEN com o Stockfish e retorna a pontuação em centipeões.
 * Usa um handler isolado para evitar vazamento de memória.
 */
function avaliarPosicao(fen, depth = 10) {
    return new Promise((resolve) => {
        if (!engine) { resolve(0); return; }

        let ultimoScore = 0;
        let resolvido   = false;

        const handler = (event) => {
            const msg = event.data;
            if (typeof msg !== 'string') return;

            if (msg.includes('score cp')) {
                const m = msg.match(/score cp (-?\d+)/);
                if (m) ultimoScore = parseInt(m[1]);
            }
            if (msg.includes('score mate')) {
                const m = msg.match(/score mate (-?\d+)/);
                if (m) ultimoScore = parseInt(m[1]) > 0 ? 10000 : -10000;
            }

            if (msg.startsWith('bestmove') && !resolvido) {
                resolvido = true;
                engine.removeEventListener('message', handler);
                resolve(ultimoScore);
            }
        };

        engine.addEventListener('message', handler);
        engine.postMessage('position fen ' + fen);
        engine.postMessage('go depth ' + depth);

        // Timeout de segurança — libera o handler mesmo que o engine trave
        setTimeout(() => {
            if (!resolvido) {
                resolvido = true;
                engine.removeEventListener('message', handler);
                resolve(ultimoScore);
            }
        }, 8000);
    });
}

function classificarLance(perdaCp) {
    const p = Math.abs(perdaCp);
    if (p <= 10)  return { texto: 'Ótimo',       classe: 'badge-otimo' };
    if (p <= 25)  return { texto: 'Bom',          classe: 'badge-bom' };
    if (p <= 60)  return { texto: 'Imprecisão',   classe: 'badge-imprecisao' };
    if (p <= 150) return { texto: 'Erro',          classe: 'badge-erro' };
    return             { texto: 'Erro Grave',    classe: 'badge-grave' };
}

function calcularPrecisao(perdas) {
    if (perdas.length === 0) return 100;
    const k    = 50; // sensibilidade
    const soma = perdas.reduce((acc, p) => acc + Math.exp(-Math.abs(p) / k), 0);
    return Math.round((soma / perdas.length) * 100);
}

async function analisarPartida() {
    const historico = game.history();
    if (historico.length < 2 || !engine) {
        // Exibir revisão sem análise se engine indisponível
        document.getElementById('modalRevisao').style.display = 'flex';
        document.getElementById('revisaoLances').innerHTML =
            '<p class="historico-vazio">Engine indisponível para análise detalhada.</p>';
        return;
    }

    document.getElementById('modalRevisao').style.display = 'flex';
    document.getElementById('revisaoProgresso').style.display = 'flex';
    document.getElementById('revisaoLances').innerHTML = '';
    document.getElementById('barraBrancas').style.width = '0%';
    document.getElementById('barraBrancas').textContent = '...';
    document.getElementById('barraPretas').style.width = '0%';
    document.getElementById('barraPretas').textContent = '...';

    // Resetar engine para análise limpa
    engine.postMessage('ucinewgame');

    // Replay para obter FEN de cada posição
    const replay   = new Chess();
    const posicoes = [replay.fen()];
    for (const lance of historico) {
        replay.move(lance);
        posicoes.push(replay.fen());
    }

    // Avaliar cada posição sequencialmente
    const avaliacoes      = [];
    const progressoTexto  = document.getElementById('progressoTexto');
    const totalPos        = posicoes.length;

    for (let i = 0; i < totalPos; i++) {
        progressoTexto.textContent = `${i + 1}/${totalPos}`;
        const score = await avaliarPosicao(posicoes[i], 10);
        avaliacoes.push(score);
    }

    document.getElementById('revisaoProgresso').style.display = 'none';

    // Calcular perda por lance
    const resultados    = [];
    const perdasBrancas = [];
    const perdasPretas  = [];

    for (let i = 0; i < historico.length; i++) {
        const ehBrancas  = (i % 2 === 0);
        const avalAntes  = avaliacoes[i];
        const avalDepois = avaliacoes[i + 1];

        // Perda = soma (perspectivas opostas se anulam se lance foi perfeito)
        let perda = Math.max(0, Math.min(avalAntes + avalDepois, 500));

        if (ehBrancas) perdasBrancas.push(perda);
        else            perdasPretas.push(perda);

        resultados.push({
            lance: historico[i],
            ehBrancas,
            perda,
            classificacao: classificarLance(perda)
        });
    }

    // Exibir precisão
    const precBrancas = calcularPrecisao(perdasBrancas);
    const precPretas  = calcularPrecisao(perdasPretas);

    const barraBrancas = document.getElementById('barraBrancas');
    const barraPretas  = document.getElementById('barraPretas');

    barraBrancas.style.width  = precBrancas + '%';
    barraBrancas.textContent  = precBrancas + '%';
    barraPretas.style.width   = precPretas  + '%';
    barraPretas.textContent   = precPretas  + '%';

    // Atualizar aria-valuenow para acessibilidade
    barraBrancas.parentElement.setAttribute('aria-valuenow', precBrancas);
    barraPretas.parentElement.setAttribute('aria-valuenow', precPretas);

    // Montar lista de lances
    let lancesHtml = '';
    for (let i = 0; i < resultados.length; i++) {
        const r   = resultados[i];
        const num = r.ehBrancas ? (Math.floor(i / 2) + 1) + '.' : '';
        const cor = r.ehBrancas ? '♔' : '♚';
        lancesHtml += `
            <div class="rev-lance" role="listitem"
                 aria-label="${cor} Lance ${num} ${r.lance}: ${r.classificacao.texto}">
                <span class="rev-num">${num}</span>
                <span class="rev-move">${cor} ${r.lance}</span>
                <span class="rev-badge ${r.classificacao.classe}">${r.classificacao.texto}</span>
            </div>`;
    }
    document.getElementById('revisaoLances').innerHTML = lancesHtml;

    // Anunciar resultado por voz
    falarTexto(`Análise concluída. Brancas: ${precBrancas} por cento de precisão. Pretas: ${precPretas} por cento de precisão.`);
}

function fecharRevisao() {
    document.getElementById('modalRevisao').style.display = 'none';
}
