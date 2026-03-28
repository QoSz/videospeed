/**
 * Custom element for the video speed controller
 * Uses Web Components to avoid CSS conflicts with page styles
 */

export class VSCControllerElement extends HTMLElement {
  static register(): void {
    // Define the custom element if not already defined
    if (!customElements.get('vsc-controller')) {
      customElements.define('vsc-controller', VSCControllerElement);
      window.VSC.logger?.info('VSC custom element registered');
    }
  }
}

window.VSC.VSCControllerElement = VSCControllerElement;

// Auto-register when the script loads
VSCControllerElement.register();
