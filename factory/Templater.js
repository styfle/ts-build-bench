const fs = require('fs-extra');
const handlebars = require('handlebars');
const { resolve: resolvePath, relative: relativePath } = require('path');

module.exports = class Templater {
  constructor({ dir, target }) {
    this.templateDir = dir;
    this.targetDir = target;
  }

  async hydrate({ name, path, data = {} }) {
    const templatePath = resolvePath(this.templateDir, name);
    const targetPath = resolvePath(this.targetDir, path);

    const templates = [];
    await fs.copy(templatePath, targetPath, {
      filter: (file) => {
        if (file.endsWith('.hbs')) {
          templates.push(file);
          return false;
        }
        return true;
      },
    });

    for (const path of templates) {
      const outPath = resolvePath(
        targetPath,
        relativePath(templatePath, path).replace(/\.hbs$/, '')
      );

      const contents = await fs.readFile(path, 'utf8');
      const result = handlebars.compile(contents)(data);
      await fs.writeFile(outPath, result);
    }
  }

  async addLine(path, line) {
    const filePath = resolvePath(this.targetDir, path);
    await fs.appendFile(filePath, `\n${line}\n`, 'utf8');
  }

  async addDep(path, name, version) {
    const filePath = resolvePath(this.targetDir, path);
    const pkg = await fs.readJson(filePath);
    pkg.dependencies[name] = version;
    await fs.writeJson(filePath, pkg, { spaces: 2 });
  }
};