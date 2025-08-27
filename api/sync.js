// api/sync.js
module.exports = async function (req, res) {
  const { method } = req;

  // === CONFIGURACIÓN ===
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'rubendml';
  const REPO = 'numismatica';
  const BRANCH = 'main';

  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN no está definido');
    return res.status(500).json({ error: 'Token de GitHub no configurado' });
  }

  try {
    // === LECTURA: GET /api/sync?path=data/catálogo.json ===
    if (method === 'GET') {
      const PATH = req.query.path || 'data/catálogo.json';
      const fileUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos

      const response = await fetch(fileUrl, {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('❌ Error al obtener archivo:', error);
        return res.status(response.status).json({ error: error.message });
      }

      const data = await response.json();
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const jsonData = JSON.parse(content);

      return res.status(200).json(jsonData);
    }

    // === ESCRITURA: POST /api/sync → Guardar colección ===
    if (method === 'POST') {
      const { path, content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'No se proporcionó contenido' });
      }

      const targetPath = path || 'data/coleccion.json';
      const encodedContent = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');

      const fileUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${targetPath}`;
      const fileRes = await fetch(fileUrl, {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      let sha = null;
      if (fileRes.ok) {
        const fileData = await fileRes.json();
        sha = fileData.sha;
      } else if (fileRes.status !== 404) {
        const error = await fileRes.json();
        console.error('❌ Error al obtener el archivo:', error);
        return res.status(fileRes.status).json({ error: error.message });
      }

      const commitRes = await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Sincronización automática - ${new Date().toLocaleString('es-ES')}`,
          content: encodedContent,
          sha,
          branch: BRANCH
        })
      });

      const result = await commitRes.json();

      if (commitRes.ok) {
        return res.status(200).json({
          success: true,
          message: 'Archivo actualizado correctamente en GitHub',
          commit: result.commit
        });
      } else {
        console.error('❌ Error en la API de GitHub:', result);
        return res.status(commitRes.status).json({
          success: false,
          error: result.message
        });
      }
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('❌ Error en el proxy:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};
