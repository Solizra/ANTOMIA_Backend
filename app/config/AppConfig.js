import { fileURLToPath } from 'url';
import path from 'path';

/**
 * AppConfig centraliza todo el acceso a variables de entorno y rutas
 * de forma orientada a objetos. Evita duplicar lógica de lectura y
 * simplifica el testing de cada módulo.
 */
export default class AppConfig {
  constructor(env = process.env) {
    this.env = env;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.projectRoot = path.resolve(__dirname, '../../');

    this.defaults = {
      port: 3000,
      workflowFile: 'auto-update.yml',
      defaultBranch: 'main'
    };
  }

  getPort() {
    return Number(this.env.PORT) || this.defaults.port;
  }

  getNewsFilePath() {
    return path.join(this.projectRoot, 'APIs', 'noticias.json');
  }

  /**
   * Lista de emails con permiso para añadir usuarios administrativamente.
   */
  getUserAdderWhitelist() {
    if (this._whitelist) return this._whitelist;

    const envList = (this.env.USER_ADDER_WHITELIST || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    // Fallback al set original si la variable no existe
    const defaultList = [
      'solizraa@gmail.com',
      'sassonindiana@gmail.com',
      '48460067@est.ort.edu.ar',
      'paula@antom.la'
    ];

    this._whitelist = new Set(envList.length > 0 ? envList : defaultList);
    return this._whitelist;
  }

  getGithubWorkflowConfig() {
    return {
      owner: this.env.GITHUB_REPO_OWNER,
      repo: this.env.GITHUB_REPO_NAME,
      workflowFile: this.env.GITHUB_WORKFLOW_FILE || this.defaults.workflowFile,
      ref: this.env.GITHUB_DEFAULT_BRANCH || this.defaults.defaultBranch,
      token: this.env.GITHUB_TOKEN,
      adminToken: this.env.ADMIN_API_TOKEN
    };
  }
}

