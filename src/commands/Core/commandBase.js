export class Command {
  constructor(data) {
    this.data = data;
  }

  async execute(interaction) {
    throw new Error("Execute not implemented");
  }
}
