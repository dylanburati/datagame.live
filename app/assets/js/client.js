export class RestClient {
  constructor(routes) {
    this.routes = routes;
  }

  async getSpreadsheet(id) {
    const response = await fetch(`${this.routes.show}${id}`);
    return await response.json();
  }
}