// tslint:disable:no-inferrable-types

import { Component, OnDestroy, ChangeDetectorRef, AfterViewInit, Input, OnChanges, SimpleChanges, SimpleChange } from '@angular/core';
import { IDeviceInfo, IDeviceState, IIOState } from '../../../common/interface.deviceinfo';
import * as Toolkit from 'chipmunk.client.toolkit';

@Component({
    selector: 'lib-sb-deviceinfo-com',
    templateUrl: './template.html',
    styleUrls: ['./styles.less']
})

export class SidebarVerticalDeviceInfoComponent implements AfterViewInit, OnDestroy, OnChanges {

    @Input() public device: IDeviceInfo;
    @Input() public state: IDeviceState;

    public _ng_more: Array<{ name: string, value: string}> = [];
    public _ng_read: string = '';

    private _subscriptions: { [key: string]: Toolkit.Subscription } = {};
    private _destroyed: boolean = false;
    private _more: boolean = false;

    constructor(private _cdRef: ChangeDetectorRef) {
    }

    ngOnDestroy() {
        this._destroyed = true;
        Object.keys(this._subscriptions).forEach((key: string) => {
            this._subscriptions[key].unsubscribe();
        });
    }

    ngAfterViewInit() {
        if (this.device === undefined || this.device === null) {
            return;
        }
        Object.keys(this.device).forEach((key: string) => {
            if (key === 'path') {
                return;
            }
            if (this.device[key] === undefined && this.device[key] === null) {
                return;
            }
            this._ng_more.push({ name: key, value: this.device[key] });
        });
        this._forceUpdate();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes.state !== undefined) {
            this.state = changes.state.currentValue;
            this._updateSize();
        }
    }

    public _ng_isMoreOpened(): boolean {
        return this._more;
    }

    public _ng_onMore(event: MouseEvent) {
        this._more = !this._more;
        event.stopImmediatePropagation();
        event.preventDefault();
        this._forceUpdate();
    }

    private _updateSize() {
        let read: string = '';
        if (this.state.ioState.read === 0) {
            read = '';
        } else if (this.state.ioState.read > 1024 * 1024 * 1024) {
            read = (this.state.ioState.read / 1024 / 1024 / 1024).toFixed(2) + ' Gb';
        } else if (this.state.ioState.read > 1024 * 1024) {
            read = (this.state.ioState.read / 1024 / 1024).toFixed(2) + ' Mb';
        } else if (this.state.ioState.read > 1024) {
            read = (this.state.ioState.read / 1024).toFixed(2) + ' Kb';
        } else {
            read = this.state.ioState.read + ' b';
        }
        this._ng_read = read;
        this._forceUpdate();
    }

    private _forceUpdate() {
        if (this._destroyed) {
            return;
        }
        this._cdRef.detectChanges();
    }

}
