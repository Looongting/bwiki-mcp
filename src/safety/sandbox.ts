export class SandboxManager {
  constructor(private sandboxPageTemplate: string, private username: string) {}

  getSandboxPage(page: string): string {
    const prefix = this.sandboxPageTemplate.replace('${username}', this.username);
    // Remove namespace prefix if present (e.g., "Template:City" -> "City")
    const cleanPage = page.includes(':') ? page.split(':').slice(1).join(':') : page;
    return `${prefix}/${cleanPage}`;
  }

  isSandboxPage(page: string): boolean {
    const prefix = this.sandboxPageTemplate.replace('${username}', this.username);
    return page.startsWith(prefix);
  }
}
