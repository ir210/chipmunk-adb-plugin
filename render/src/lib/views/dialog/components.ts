// tslint:disable:no-inferrable-types

import { Component, ChangeDetectorRef, Input, OnInit, OnDestroy, ViewChild, AfterViewInit } from '@angular/core';
import { IDeviceInfo, IDeviceState } from '../../common/interface.deviceinfo';
import { IOptions, CDefaultOptions } from '../../common/interface.options';
import { Subscription, Subject, Observable } from 'rxjs';
import Service from '../../services/service';

interface IConnected {
    device: IDeviceInfo;
    options: IOptions;
    state: IDeviceState;
}

@Component({
    selector: 'lib-sb-device-dialog-com',
    templateUrl: './template.html',
    styleUrls: ['./styles.less']
})

export class SidebarVerticalDeviceDialogComponent implements OnInit, OnDestroy, AfterViewInit {
    @Input() public _onConnect: () => void;
    @Input() public _requestDeviceList: () => IDeviceInfo[];
    @Input() public _getSelected: (IDeviceInfo) => void;
    @Input() public _options: IOptions[];
    @Input() public _ng_canBeConnected: () => boolean;
    @Input() public _ng_connected: IConnected[];
    @Input() public _ng_onOptions: () => void;
    @Input() public _ng_onDeviceSelect: (device: IDeviceInfo) => void;

    private _interval: any;
    private _timeout = 1000;
    private _subscriptions: { [key: string]: Subscription } = {};
    private _destroyed: boolean = false;
    private _subjects = { tick: new Subject<boolean>() };

    public _ng_devices: IDeviceInfo[] = [];
    public _ng_selected: IDeviceInfo | undefined;
    public _ng_busy: boolean = false;
    public _ng_error: string | undefined;
    public _ng_spyState: { [key: string]: number } = {};

    constructor(private _cdRef: ChangeDetectorRef) {
    }

    ngOnInit() {
        this._subscriptions.Subscription = Service.getObservable().event.subscribe((message: any) => {
            if (typeof message !== 'object' || message === null) {
                return;
            }
            this._onSpyState(message);
            this._forceUpdate();
        });
        this._ng_devices = this._requestDeviceList();
        this._ng_devices.forEach(device => {
            if (this._ng_spyState[device.name] === undefined) {
                this._ng_spyState[device.name] = 0;
            }
        });
    }

    ngAfterViewInit() {
        this._next();
    }

    ngOnDestroy() {
      clearTimeout(this._interval);
      Service.stopSpy(this._options);
      Object.keys(this._subscriptions).forEach((key: string) => {
        this._subscriptions[key].unsubscribe();
      });
      this._destroyed = true;
    }

    public onTick(): { tick: Observable<boolean> } {
        return { tick: this._subjects.tick.asObservable() };
    }

    private _next() {
        clearTimeout(this._interval);
        this._subjects.tick.next(true);
        this._interval = setTimeout(this._next.bind(this), this._timeout);
    }

    private _onSpyState(msg: {[key: string]: number}) {
        Object.keys(msg).forEach((device: string) => {
            if (this._ng_spyState[device]) {
                this._ng_spyState[device] += msg[device];
            } else {
                this._ng_spyState[device] = msg[device];
            }
        });
    }

    private _forceUpdate() {
        if (this._destroyed) {
            return;
        }
        this._cdRef.detectChanges();
    }

    public _ng_onConnect(device?: IDeviceInfo) {
        if (device) {
            this._ng_selected = device;
        }

        this._getSelected(this._ng_selected);
        this._onConnect();
    }

    public _ng_isDeviceSelected(device: IDeviceInfo): boolean {
        if (this._ng_selected === undefined) {
            return false;
        }
        return this._ng_selected.name === device.name ? true : false;
    }

    public _ng_getState(device: IDeviceInfo): IDeviceState {
        const target: IConnected | undefined = this._ng_connected.find((connected: IConnected) => {
            return connected.device.name === device.name;
        });
        if (target === undefined) {
            return {
                connections: 0,
                ioState: { written: 0, read: 0 }
            };
        } else {
            return target.state;
        }
    }
}
