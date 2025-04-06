/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// constants using inside runtype params should be declared as types
export type EMAIL_NAME_SAMPLES = [
    // English Names
    'john.doe',
    'jane.smith',
    'admin',
    'support',
    'contact',
    'info',
    'sales',
    'marketing',
    'hello',
    'feedback',
    'user123',
    'test.account',
    'random.name',
    'developer',
    'webmaster',

    // Spanish Names
    'juan.perez',
    'maria.garcia',
    'soporte',
    'contacto',
    'ventas',
    'informacion',
    'hola',
    'usuario',
    'prueba',
    'desarrollador',

    // French Names
    'jean.dupont',
    'marie.curie',
    'contact',
    'support',
    'vente',
    'bonjour',
    'utilisateur',
    'testeur',
    'developpeur',

    // German Names
    'hans.schmidt',
    'anna.müller',
    'kontakt',
    'hilfe',
    'verkauf',
    'benutzer',
    'testkonto',
    'entwickler',

    // Italian Names
    'giuseppe.rossi',
    'maria.bianchi',
    'contatto',
    'supporto',
    'vendite',
    'utente',
    'prova',
    'sviluppatore',

    // Portuguese Names
    'joao.silva',
    'maria.oliveira',
    'contato',
    'suporte',
    'vendas',
    'usuario',
    'teste',
    'desenvolvedor',

    // Korean Names (Hangul)
    '홍길동',
    '김철수',
    '고객지원',
    '연락처',
    '판매',
    '사용자',

    // Japanese Names (Kanji and Kana)
    '山田太郎',
    '鈴木花子',
    '情報',
    'サポート',
    '日本語',
    'テスト',
    '携帯',
    '電子',

    // Chinese Names (Chinese Characters)
    '李伟',
    '王芳',
    '张三',
    '联系',
    '测试',
    '用户',
    '开发',

    // Indian Names
    'arjun.sharma',
    'priya.kumar',
    'support',
    'contact',
    'vikas',
    'pariksha',
    'upayogakarta',

    // Russian Names (Cyrillic)
    'иван.иванов',
    'анна.петровна',
    'поддержка',
    'контакт',
    'продажи',
    'пользователь',
    'разработчик',

    // Miscellaneous
    'alpha.beta',
    'charlie.delta',
    'test123',
    'mock.user',
    'example.name',
    'first.last',
    'nickname',
    'alias',
    'temp.account',
    'demo.user',
];

export type URL_SAMPLES = [
    // http and https
    'https://mion.io',
    'https://rpc.org',
    'http://wiki.org',
    'https://www.mion.org',
    'http://www.api.org',
    'https://arch.org/path/to/resource',
    'http://ccmns.org/path/to/resource',
    'https://eff.org?query=param',
    'http://fsf.org?query=param#hello-world',
    'https://opensource.org#fragment',
    'http://node.org#fragment',
    'https://subdomain.typescript.org',
    'http://subdomain.rpc.org',
    'https://fullstack.org:8080',

    // localhost and IP addresses
    'http://localhost:8080/path/to/resource',
    'https://127.0.0.1:8080/path/to/resource',
    'https://254.60.167.80:80/path/to/resource',
    'http://:8080/path/to/resource',
    'http://[::1]:8080/path/to/resource',
    'http://[::]:8080/path/to/resource?query=param',
    'http://[::1]:8080/path/to/resource#fragment',
    'http://[::1]/path/to/resource',

    // ws and wss
    'ws://mion.io/socket',
    'ws://websocket.org/socket',
    'wss://socket.io/socket',
    'ws://live.com/socket?query=param',
    'wss://sock.org/socket?query=param#fragment',
    'ws://socketcluster.io/socket#fragment',
    'wss://developer..dev:8080/socket',
    'ws://fast.com:8080/socket?query=param',

    /// ftp & ftps
    'ftp://example.com/file.txt',
    'ftps://example.com/file.txt',
];

export type FILE_URL_SAMPLES = [
    // File URLs
    'file:///path/to/file.txt',
    'file:///C:/path/to/file.txt',
    'file://localhost/path/to/file.txt',
    'file:///home/user/file.txt',
    'file://example.com/path/to/file.txt',
    'file:///C:/Users/User/Documents/file.txt',
    'file:///tmp/file.txt',
    'file:///var/log/syslog',

    // File URLs with query parameters
    'file:///path/to/file.txt?query=param',
    'file:///C:/path/to/file.txt?query=param',

    // file URLs with special characters
    'file:///path/to/file%20with%20spaces.txt',
    'file:///path/to/file@with@special#characters.txt',

    // file with localhost & ips

    'file://localhost/path/to/file.txt',
    'file://localhost/C:/path/to/file.txt',
    'file://localhost/home/user/file.txt',
    'file://127.0.0.1:890/example.com/path/to/file.txt',
    'file://localhost/path/to/file.txt?query=param',
    'file:///home/user/file.txt?query=param',
];

export type HTTP_URL_SAMPLES = [
    // http and https
    'https://mion.io',
    'https://rpc.org',
    'http://wiki.org',
    'https://www.mion.org',
    'http://www.api.org',
    'https://arch.org/path/to/resource',
    'http://ccmns.org/path/to/resource',
    'https://eff.org?query=param',
    'http://fsf.org?query=param#hello-world',
    'https://opensource.org#fragment',
    'http://node.org#fragment',
    'https://subdomain.typescript.org',
    'http://subdomain.rpc.org',
    'https://fullstack.org:8080',

    // localhost and IP addresses
    'http://localhost:8080/path/to/resource',
    'https://127.0.0.1:8080/path/to/resource',
    'https://254.60.167.80:80/path/to/resource',
    'http://:8080/path/to/resource',
    'http://[::1]:8080/path/to/resource',
    'http://[::]:8080/path/to/resource?query=param',
    'http://[::1]:8080/path/to/resource#fragment',
    'http://[::1]/path/to/resource',
];

export type SOCIAL_MEDIA_URL_SAMPLES = [
    // Social Media URLs
    'https://www.facebook.com/user',
    'https://twitter.com/user',
    'https://www.instagram.com/user/',
    'https://www.linkedin.com/in/user/',
    'https://www.tiktok.com/@user',
    'https://www.youtube.com/c/user',
    'https://www.snapchat.com/add/user',
    'https://www.pinterest.com/user?query=param',
    'https://www.reddit.com/user/user#fragment',
    'https://www.whatsapp.com/user/',

    'http://www.facebook.com/user',
    'http://twitter.com/user',
    'http://www.instagram.com/user/',
    'http://www.linkedin.com/in/user/?query=param',
    'http://www.tiktok.com/@user',
    'http://www.youtube.com/c/user',
    'http://www.snapchat.com/add/user?query=param#fragment',
    'http://www.pinterest.com/user/',
    'http://www.reddit.com/user/user/#fragment',
    'http://www.whatsapp.com/user/',
];

export const TLD_SAMPLES = [
    'com',
    'org',
    'net',
    'io',
    'ai',
    'app',
    'co',
    'dev',
    'tech',
    'co.uk',
    'com.au',
    'com.br',
    'com.mx',
    'com.ar',
];
export const NAME_SAMPLES = [
    'mion',
    'mionkit',
    'example',
    'gogle',
    'fcbook',
    'amzn',
    'twitt',
    'insta',
    'linked',
    'yoube',
    'pinturist',
    'mion',
    'mionkit',
    'wiki',
    'red',
    'line',
    'hello',
    'world',
    'test',
    'random',
    'user',
    'developer',
    'webmaster',
    'admin',
    'support',
    'contact',
    'info',
    'mion',
    'mionkit',
];

export const TLD_CHARS = 'abcdefghijklmnopqrstuvwxyz';
export const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
