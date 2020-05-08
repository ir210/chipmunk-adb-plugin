import Logger from './env/env.logger';
import ServiceDevices from './services/service.sessions';

class Plugin {
    private _logger: Logger = new Logger('SerialPorts');

    constructor() {
        this._logger.env(`Plugin is executed`);
        process.once('beforeExit', this._beforeProcessExit.bind(this));
    }

    private _beforeProcessExit() {
        ServiceDevices.destroy();
    }

}

const app: Plugin = new Plugin();
