
import util from './helpers'
import SignalProtocolStore from "./InMemorySignalProtocolStore";

const libsignal  = window.libsignal
export class SignalServerStore {
    /* constructor() {
        this.store = {};
    } */
    /**
     * Khi người dùng đăng nhập họ tạo ra các khoá của họ và đăng ký với server
     * @param userId The user ID.
     * @param preKeyBundle Bộ khoá do người dùng tạo
     */
    registerNewPreKeyBundle(userId, preKeyBundle) {
        let storageBundle = { ...preKeyBundle }
        storageBundle.identityKey = util.arrayBufferToBase64(storageBundle.identityKey)
        storageBundle.preKey.publicKey = util.arrayBufferToBase64(storageBundle.preKey.publicKey)
        storageBundle.signedPreKey.publicKey = util.arrayBufferToBase64(storageBundle.signedPreKey.publicKey)
        storageBundle.signedPreKey.signature = util.arrayBufferToBase64(storageBundle.signedPreKey.signature)
        localStorage.setItem(userId, JSON.stringify(storageBundle))
    }

    /**
     * Lấy bộ pre-key cho người dùng
     * Nếu muốn bắt đầu cuộc trò chuyện với một người dùng phải lấy bộ khoá của họ đầu tiên
     * 
     * @param userId ID của người dùng.
     */
    getPreKeyBundle(userId) {
        let storageBundle = JSON.parse(localStorage.getItem(userId))
        storageBundle.identityKey = util.base64ToArrayBuffer(storageBundle.identityKey)
        storageBundle.preKey.publicKey = util.base64ToArrayBuffer(storageBundle.preKey.publicKey)
        storageBundle.signedPreKey.publicKey = util.base64ToArrayBuffer(storageBundle.signedPreKey.publicKey)
        storageBundle.signedPreKey.signature = util.base64ToArrayBuffer(storageBundle.signedPreKey.signature)
        return storageBundle
    }
}

/**
 *  Quản lý giao thức.
 */
class SignalProtocolManager {
    constructor(userId, signalServerStore) {
        this.userId = userId;
        this.store = new SignalProtocolStore();
        this.signalServerStore = signalServerStore;
    }

    /**
     * Khởi tạo một manager khi người dùng log on.
     */
    async initializeAsync() {
        await this._generateIdentityAsync();

        var preKeyBundle = await this._generatePreKeyBundleAsync();

        this.signalServerStore.registerNewPreKeyBundle(this.userId, preKeyBundle);
    }

    /**
     * Mã hoá tin nhắn cho người dùng.
     * 
     * @param remoteUserId ID người nhận.
     * @param message
     */
    async encryptMessageAsync(remoteUserId, message) {
        var sessionCipher = this.store.loadSessionCipher(remoteUserId);

        if (sessionCipher == null) {
            var address = new libsignal.SignalProtocolAddress(remoteUserId, 123);
            // Khởi tạo một SessionBuilder cho recipientId và deviceId từ xa.
            var sessionBuilder = new libsignal.SessionBuilder(this.store, address);

            var remoteUserPreKey = this.signalServerStore.getPreKeyBundle(remoteUserId);
            // Process a prekey được lấy từ server. Trả về một promise giải quyết khi một
            // session được tạo and được lưu trong store, hoặc từ chối nếu
            // identityKey khác một identity đã nhận trước cho vấn đề này.
            await sessionBuilder.processPreKey(remoteUserPreKey);

            var sessionCipher = new libsignal.SessionCipher(this.store, address);
            this.store.storeSessionCipher(remoteUserId, sessionCipher);
        }

        let cipherText = await sessionCipher.encrypt(util.toArrayBuffer(message));
        return cipherText
    }

    /**
     * Giải mã tin nhắn
     * 
     * @param remoteUserId User ID của người gửi .
     * @param cipherText Tin nhắn được mã hoá
     * @returns Trả về tin nhắn được giải mã.
     */
    async decryptMessageAsync(remoteUserId, cipherText) {
        var sessionCipher = this.store.loadSessionCipher(remoteUserId);

        if (sessionCipher == null) {
            var address = new libsignal.SignalProtocolAddress(remoteUserId, 123);
            var sessionCipher = new libsignal.SessionCipher(this.store, address);
            this.store.storeSessionCipher(remoteUserId, sessionCipher);
        }

        var messageHasEmbeddedPreKeyBundle = cipherText.type === 3;
        // Giải mã a PreKeyWhisperMessage bằng cách thiết lập một phiên mới đầu tiên.
        // Trả về một promise sẽ giải quyết khi tin nhắn được giải mã hoặc
        // từ chối nếu danh identityKey khác với ID đã thấy trước đây cho địa chỉ này.
        if (messageHasEmbeddedPreKeyBundle) {
            var decryptedMessage = await sessionCipher.decryptPreKeyWhisperMessage(cipherText.body, 'binary');
            return util.toString(decryptedMessage);
        } else {
            // Giải mã một tin nhắn bình thường bằng một phiên hiện có.
            var decryptedMessage = await sessionCipher.decryptWhisperMessage(cipherText.body, 'binary');
            return util.toString(decryptedMessage);
        }
    }

    /**
     * Tạo định danh mới cho người dùng cục bộ.
     */
    async _generateIdentityAsync() {
        var results = await Promise.all([
            libsignal.KeyHelper.generateIdentityKeyPair(),
            libsignal.KeyHelper.generateRegistrationId(),
        ]);

        this.store.put('identityKey', results[0]);
        this.store.put('registrationId', results[1]);
    }

    /**
     * Tạo gói pre-key mới cho người dùng cục bộ.
     * 
     * @returns Một bộ pre-key.
     */
    async _generatePreKeyBundleAsync() {
        var result = await Promise.all([
            this.store.getIdentityKeyPair(),
            this.store.getLocalRegistrationId()
        ]);

        let identity = result[0];
        let registrationId = result[1];

        var keys = await Promise.all([
            libsignal.KeyHelper.generatePreKey(registrationId + 1),
            libsignal.KeyHelper.generateSignedPreKey(identity, registrationId + 1)
        ]);

        let preKey = keys[0]
        let signedPreKey = keys[1];

        this.store.storePreKey(preKey.keyId, preKey.keyPair);
        this.store.storeSignedPreKey(signedPreKey.keyId, signedPreKey.keyPair);

        return {
            identityKey: identity.pubKey,
            registrationId: registrationId,
            preKey: {
                keyId: preKey.keyId,
                publicKey: preKey.keyPair.pubKey
            },
            signedPreKey: {
                keyId: signedPreKey.keyId,
                publicKey: signedPreKey.keyPair.pubKey,
                signature: signedPreKey.signature
            }
        };
    }
}

export async function createSignalProtocolManager(userid, name, dummySignalServer) {
    let signalProtocolManagerUser = new SignalProtocolManager(userid, dummySignalServer);
    await Promise.all([
        signalProtocolManagerUser.initializeAsync(),
    ]);
    return signalProtocolManagerUser
}




