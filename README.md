# Một ứng dụng chat an toàn sử dụng react va signal protocol

## Cong nghe su dung
1. Thu vien ReactJs de tao giao dien
2. Giao thuc Signal cho ma hoa dau cuoi
3. Axios cho AJAX
4. LocalStorage de luu cac message
5. Web Sockets cho viec nhan tin tuc thi

## Components
1. Login
2. Chat Window
    1. Contact List: Danh sach ban be de nhan tin
    2. Message Box : Luu tru cac tin nhan va hien thi chung

## Axios Calls
1. GET - api/users/login/userName/password - Tra ve doi tuong User
2. GET - api/users/users/userId/role - Tra ve nguoi dung co vai tro khac voi nguoi dung hien tai
## Web Sockets
1. Khoi tao mot ket noi WS: `let webSocket = new WebSocket("ws://localhost:3000/chat")`
2. Lang nghe su kien cua doi tuong Socket:
```
    webSocket.onopen = () => {
        console.log(‘WebSocket Client Connected’);
        webSocket.send('Hi this is web client.');
    };
    webSocket.onmessage = (e) => {
        console.log(‘Received: ’ + e.data);
    };
    webSocket.close = () => {
        console.log('WebSocket Client Closed.’);
    };
```

## Giao thuc trao doi tin nhan an toan Signal
1. InMemorySignalProtocolStore.js (and helpers.js) được lấy cho mục đích lưu trữ từ Signal Github (liên kết được đề cập trong tài nguyên)
2. libsignal-protocol.js (cũng từ Signal Github) triển khai giao thức
3. Signal Gateway - Được tạo ra để tích hợp React với Signal. Nó thực hiện chức năng Khởi tạo, Mã hóa và Giải mã khi được yêu cầu trên Frontend.
4. Các method cho việc mã hoá:
```
async getNewMsgObj(newMsgObj) {
        let selectedUserChatId = this.getSelectedUserChatId()
        let msgToSend = { chatId: selectedUserChatId, senderid: this.props.loggedInUserObj._id, receiverid: this.state.messageToUser._id, ...newMsgObj }
        //Gửi tin nhắn mã hóa đến Signal Protocol, sau đó gửi tin nhắn mã hóa đến máy chủ chính
        try {
            let encryptedMessage = await this.props.signalProtocolManagerUser.encryptMessageAsync(this.state.messageToUser._id, newMsgObj.message);
            msgToSend.message = encryptedMessage
            this.state.ws.send(JSON.stringify(msgToSend))
            this.setState({ lastSentMessage: newMsgObj.message }) // Storing last-sent message for Verification with Received Message
        } catch (error) {
            console.log(error);
        }
    }
```
5. Các method cho việc giải mã:
```
ws.onmessage = async (e) => {
            let newMessage = JSON.parse(e.data)
            //Xác minh những tin nhắn được nhận thành công
            if (newMessage.senderid === this.props.loggedInUserObj._id) {
                newMessage.message = this.state.lastSentMessage
            } else { // Trương hợp khác mã hoá nó và lưu nó vào newMessage
                // Mã hoá sử dụng giao thức Signal
                let decrytedMessage = await this.props.signalProtocolManagerUser.decryptMessageAsync(newMessage.senderid, newMessage.message)
                newMessage.message = decrytedMessage
            }
    }
```

## Nguồn
1. [Signal Protocol in JavaScript Github](https://github.com/signalapp/libsignal-protocol-javascript)
2. [Why Axios](https://medium.com/@MinimalGhost/what-is-axios-js-and-why-should-i-care-7eb72b111dc0)
3. [ReactJS](https://reactjs.org/)
4. [Web Sockets API](https://developer.mozilla.org/en-US/docs/Web/API/Websockets_API)
