import fetch from 'node-fetch';

export default class AutomationRoutes {
  constructor({ config }) {
    this.config = config;
  }

  register(app) {
    app.post('/api/admin/run-auto-update', (req, res) => this.triggerWorkflow(req, res));
    app.post('/api/github/trigger-backend', (req, res) => this.triggerWorkflow(req, res));
  }

  async triggerWorkflow(req, res) {
    try {
      const cfg = this.config.getGithubWorkflowConfig();
      const adminToken = req.headers['x-admin-token'];
      if (!cfg.adminToken) {
        return res.status(500).json({ success: false, error: 'ADMIN_API_TOKEN no configurado en el servidor.' });
      }
      if (adminToken !== cfg.adminToken) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
      }

      if (!cfg.owner || !cfg.repo || !cfg.token) {
        return res.status(500).json({
          success: false,
          error: 'Variables GITHUB_REPO_OWNER, GITHUB_REPO_NAME y/o GITHUB_TOKEN no configuradas.'
        });
      }

      const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${cfg.workflowFile}/dispatches`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({ ref: cfg.ref })
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ success: false, error: text || 'Error al disparar el workflow' });
      }

      return res.status(200).json({ success: true, message: `${cfg.workflowFile} disparado correctamente` });
    } catch (error) {
      console.error('Error al disparar auto-update:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Error interno' });
    }
  }
}

