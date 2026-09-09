if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js');
    });
}

let compromissos = [];
let supabaseClient = null;
let modoEdicao = false;
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    const installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.hidden = false;
});

function verificarModoEdicao() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('modo') === 'editar';
}

document.addEventListener('DOMContentLoaded', async () => {
    modoEdicao = verificarModoEdicao();

    if (!modoEdicao) {
        document.body.classList.add('modo-leitura');
    }

    const config = window.SUPABASE_CONFIG || {};
    if (!config.url || !config.anonKey || !window.supabase) {
        mostrarErroDeConfiguracao();
        return;
    }

    supabaseClient = window.supabase.createClient(config.url, config.anonKey);

    try {
        await carregarCompromissos();
        renderizarCompromissos();
    } catch (error) {
        tratarErro('Não foi possível carregar a agenda.', error);
        return;
    }

    document.getElementById('compromissoForm').addEventListener('submit', salvarCompromisso);

    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            installBtn.hidden = true;
        });
    }
});

async function carregarCompromissos() {
    const hoje = new Date().toISOString().split('T')[0];
    const { data, error } = await supabaseClient
        .from('compromissos')
        .select('*')
        .gte('data_evento', hoje)
        .order('data_evento', { ascending: true });

    if (error) throw error;
    compromissos = data || [];
}

function renderizarCompromissos() {
    const lista = document.getElementById('compromissosList');

    if (compromissos.length === 0) {
        lista.innerHTML = '<p class="empty-message">Nenhum compromisso pendente.</p>';
        return;
    }

    lista.innerHTML = compromissos.map(item => {
        const dataFormatada = item.data_evento.split('-').reverse().join('/');
        return `
            <div class="ordem-servico-item">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>#${item.id} - ${escapeHtml(item.titulo)}</strong>
                    <span class="status status-concluida">${escapeHtml(item.categoria)} / ${escapeHtml(item.tipo)}</span>
                </div>
                <p><b>Data:</b> ${dataFormatada} | <b>Matéria:</b> ${escapeHtml(item.materia || 'Geral')} ${item.vale_nota ? '<span style="color: var(--danger); font-weight: bold;">(Avaliativo)</span>' : ''}</p>
                <p><b>Descrição:</b> ${escapeHtml(item.descricao)}</p>
                ${modoEdicao ? `
                    <div class="ordem-servico-actions">
                        <button class="btn btn-primary" style="font-size: 13px; padding: 8px;" onclick="prepararEdicao(${item.id})">Editar</button>
                        <button class="btn btn-delete" onclick="deletarCompromisso(${item.id})">Deletar</button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function prepararEdicao(id) {
    const item = compromissos.find(c => c.id === id);
    if (!item) return;

    document.getElementById('compromissoId').value = item.id;
    document.getElementById('titulo').value = item.titulo;
    document.getElementById('categoria').value = item.categoria;
    document.getElementById('tipo').value = item.tipo;
    document.getElementById('materia').value = item.materia;
    document.getElementById('data_evento').value = item.data_evento;
    document.getElementById('descricao').value = item.descricao;
    document.getElementById('vale_nota').checked = item.vale_nota;

    document.getElementById('btnSalvar').textContent = "Atualizar";

    const formSection = document.getElementById('formCompromissoSection');
    if (!formSection.classList.contains('visible')) {
        formSection.classList.add('visible');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function limparEFecharFormulario() {
    document.getElementById('compromissoForm').reset();
    document.getElementById('compromissoId').value = '';
    document.getElementById('btnSalvar').textContent = "Salvar";
    document.getElementById('formCompromissoSection').classList.remove('visible');
}

function toggleFormCompromisso() {
    limparEFecharFormulario();
    document.getElementById('formCompromissoSection').classList.toggle('visible');
}

async function salvarCompromisso(e) {
    e.preventDefault();

    const id = document.getElementById('compromissoId').value;
    const dados = {
        titulo: document.getElementById('titulo').value.trim(),
        categoria: document.getElementById('categoria').value,
        tipo: document.getElementById('tipo').value,
        materia: document.getElementById('materia').value.trim() || 'Geral',
        data_evento: document.getElementById('data_evento').value,
        descricao: document.getElementById('descricao').value.trim(),
        vale_nota: document.getElementById('vale_nota').checked
    };

    if (id) {
        // Modo Edição
        const { data, error } = await supabaseClient
            .from('compromissos')
            .update(dados)
            .eq('id', id)
            .select('*')
            .single();

        if (error) {
            tratarErro('Não foi possível atualizar o compromisso.', error);
            return;
        }

        const index = compromissos.findIndex(c => c.id === parseInt(id));
        if (index !== -1) compromissos[index] = data;
        mostrarNotificacao('Compromisso atualizado!');

    } else {
        // Modo Criação
        const { data, error } = await supabaseClient
            .from('compromissos')
            .insert(dados)
            .select('*')
            .single();

        if (error) {
            tratarErro('Não foi possível salvar o compromisso.', error);
            return;
        }

        compromissos.push(data);
        mostrarNotificacao('Compromisso cadastrado!');
    }

    compromissos.sort((a, b) => a.data_evento.localeCompare(b.data_evento));
    limparEFecharFormulario();
    renderizarCompromissos();
}

async function deletarCompromisso(id) {
    if (confirm(`Deseja deletar o item #${id}?`)) {
        const { error } = await supabaseClient
            .from('compromissos')
            .delete()
            .eq('id', id);

        if (error) {
            tratarErro('Erro ao excluir compromisso.', error);
            return;
        }

        compromissos = compromissos.filter(item => item.id !== id);
        renderizarCompromissos();
        mostrarNotificacao('Compromisso removido!');
    }
}

function mostrarNotificacao(mensagem) {
    const el = document.createElement('div');
    el.textContent = mensagem;
    el.className = 'toast';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

function mostrarErroDeConfiguracao() {
    document.getElementById('compromissosList').innerHTML =
        '<p class="empty-message">Configure as chaves do Supabase no supabase-config.js.</p>';
}

function tratarErro(mensagem, error) {
    console.error(mensagem, error);
    mostrarNotificacao(mensagem);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}