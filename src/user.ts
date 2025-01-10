import { Buffer } from 'buffer';
import { EventEmitter } from 'ee-ts';
import Pbkdf2 from 'react-native-fast-pbkdf2';
import API, { APIOptions } from './api';
import Storage from '@liqd-rn/storage';
import { State } from '@liqd-rn/state';

type UserAPIUrl = 
{
    login   : string
    logout  : string
    profile : string
    register: string
    refresh : string
}

interface UserEvents
{
    update(): void;
    ready(): void;
    profile(): void;
}

const UserStorage = Storage.Store.init<
{
    token?: { access: string, refresh: string }

}>( '@webergency:user', { encrypted: true, type: 'object' })!;

class User extends EventEmitter<UserEvents> 
{
    readonly ready: Promise<void>;
    public loaded: boolean = false;
    public profile: object | undefined;
    private apis = new Set<API>();

    private profileState = new State();
    private token: { access: string, refresh: string } | undefined;
    private clientHeaders: APIOptions['headers'] = {};

    constructor( private api: UserAPIUrl )
    {
        super();

        this.ready = new Promise( async( resolve ) =>
        {
            //this.loaded = true;

            await Storage.ready();

            if( this.token = UserStorage.token )
            {
                console.log( 'has TOKEN' );

                this.profile = await API.request( 'GET', this.api.profile, { headers: { authorization: 'Bearer ' + this.token.access }});
                this.profileState.set( this.profile, { cache: true, force: true });
            }

            resolve();

            this.emit('profile');
            this.emit('ready');
            
            //this.emit('update');
        });
    }

    public client( options: Omit<APIOptions, 'token' | 'refresh' > = {}): API
    {
        //@ts-ignore
        const api = new API({ ...options, token: () => this.token?.access, refresh: async() => 'test' });
        api.headers( this.clientHeaders );

        this.apis.add( api );

        return api;
    }

    protected setClientHeaders( headers: APIOptions['headers'] )
    {
        this.clientHeaders = headers;

        for( let api of this.apis )
        {
            api.headers( headers );
        }
    }

    public async derivePassword( email: string, password: string ): Promise<string>
    {
        return Pbkdf2.derive
        ( 
            Buffer.from( password, 'utf-8').toString('base64'), 
            Buffer.from( email, 'utf-8').toString('base64'), 
            259577, 
            32, 
            'sha-256'
        )
        .then( r => r.trim());
    }

    public async login( email: string, password: string )
    {
        password = await this.derivePassword( email, password );

        this.token = { ...this.token, ...await API.request( 'POST', this.api.login, { body: { email, password }})};

        UserStorage.token = this.token;
        UserStorage.save();

        //@ts-ignore
        this.profile = await API.request( 'GET', this.api.profile, { headers: { authorization: 'Bearer ' + this.token.access }});

        this.profileState.set( this.profile, { cache: true, force: true });
        this.emit('profile');

        //this.emit('update');
    }

    public async signIn( token: { access: string, refresh: string } )
    {
        this.token = token;

        UserStorage.token = this.token;
        UserStorage.save();

        this.profile = await API.request( 'GET', this.api.profile, { headers: { authorization: 'Bearer ' + this.token.access }});

        this.profileState.set( this.profile, { cache: true, force: true });
        this.emit('profile');

        //this.emit('update');
    }

    public async logout()
    {
        delete UserStorage.token;
        UserStorage.save();

        this.token = undefined;//await API.request( 'POST', this.api.logout );
        this.profile = undefined;


        this.profileState.set( this.profile, { cache: true, force: true });
        this.emit('profile');
    }

    public async register( form: object & { email: string, password: string })
    {
        form.password = await this.derivePassword( form.email, form.password );

        try
        {
            let registration = await API.request( 'POST', this.api.register, { body: form });

            if( registration )
            {
                await this.signIn( registration );
            }

            return true;
        }
        catch( e )
        {
            console.error( e );

            return false;
        }
    }

    public get logged()
    {
        return Boolean( this.profile );
    }

    /**/

    public get settings()
    {
        return {};  // TODO proxy na save
    }

    public async reload()
    {
        //@ts-ignore
        if( this.token.access )
        {
            //@ts-ignore
            this.profile = await API.request( 'GET', this.api.profile, { headers: { authorization: 'Bearer ' + this.token.access }});

            console.log( 'RELOAD', this.profile, 'Updating' );
        }
        else
        {
            this.profile = undefined;
        }

        this.profileState.set( this.profile, { cache: true, force: true });
        this.emit('profile');
    }

    public useProfile()
    {
        return this.profileState.use();
    }
}

export default User;