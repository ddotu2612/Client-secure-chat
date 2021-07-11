import React, { Component } from 'react'
import ContactList from './contactList'
import MessageBox from './messageBox'
import API from '../../services/api'


export default class ChatWindow extends Component {
    constructor(props) {
        super(props)
        this.state = {
            users: [],
            messageToUser: "",
            ws: null,
            chats: {},
            lastSentMessage: undefined
        }
        this.getSelectedUser = this.getSelectedUser.bind(this)
        this.getNewMsgObj = this.getNewMsgObj.bind(this)
    }

    async componentDidMount() {

        // Lấy tất cả các người dùng khác để có thể nhắn tin
        try {
            let contactsResult = await API.getContacts(this.props.loggedInUserObj._id, this.props.loggedInUserObj.role)
            this.setState({ users: contactsResult.data.data })
        } catch (error) {
            console.log("error:", error);
        }

        // Tìm các đoạn chat cũ từ LocalStorage
        let lsChats = JSON.parse(localStorage.getItem(this.props.loggedInUserObj._id + "_messages"))
        this.setState({ chats: { ...lsChats } })

        // Kết nối Web Socket 
        let ws = new WebSocket(`ws://localhost:4000/chat/${this.props.loggedInUserObj._id}`)
        console.log("New Web Socket Connection: ", ws);

        ws.onopen = () => {
            console.log("Connected Websocket main component.");
            this.setState({ ws: ws });
        }

        ws.onmessage = async (e) => {
            let newMessage = JSON.parse(e.data)
            // Kiểm tra tin nhắn đã được nhận thành công
            if (newMessage.senderid === this.props.loggedInUserObj._id) {
                newMessage.message = this.state.lastSentMessage
            } else { // Mã hoá nó và lưu vào Chats
                // Mã hoá sử dụng Signal Protocol
                let decrytedMessage = await this.props.signalProtocolManagerUser.decryptMessageAsync(newMessage.senderid, newMessage.message)
                newMessage.message = decrytedMessage
            }

            // Cập nhật tin nhắn tới Chats & LocalStorage
            // 1. Nếu Chat đã tồn tại:
            if (newMessage.chatId in this.state.chats) {
                this.setState(prevState => ({
                    chats: {
                        ...prevState.chats, [newMessage.chatId]: {
                            ...prevState.chats[newMessage.chatId],
                            messages: [...prevState.chats[newMessage.chatId].messages.concat(newMessage)]
                        }
                    }
                }), () => localStorage.setItem(this.props.loggedInUserObj._id + "_messages", JSON.stringify(this.state.chats)))
            }
            // 2. Nếu Chat chưa tồn tại, tạo chat mới:
            else {
                let newChat = {
                    chatId: newMessage.chatId,
                    members: [newMessage.senderid, newMessage.receiverid],
                    messages: []
                }
                newChat.messages.push(newMessage)
                this.setState(prevState => ({
                    chats: { ...prevState.chats, [newMessage.chatId]: newChat }
                }), () => localStorage.setItem(this.props.loggedInUserObj._id + "_messages", JSON.stringify(this.state.chats)))
            }
        }

        ws.onclose = () => {
            console.log("Disconnected Websocket main component.");
        }
    }

    // Phương thức đùng để Cập nhật lựa chọn người dùng từ Contact List 
    // Component tới Message Box Component
    getSelectedUser(selectedUser) {
        this.setState({ messageToUser: selectedUser })
    }

    // Phương thức dùng để gửi một tin nhắn mới sử dụng Websocket when mà người dùng nhấn vào
    // nút gửi tin nhắn từ Message Box
    async getNewMsgObj(newMsgObj) {
        let selectedUserChatId = this.getSelectedUserChatId()
        let msgToSend = { chatId: selectedUserChatId, senderid: this.props.loggedInUserObj._id, receiverid: this.state.messageToUser._id, ...newMsgObj }
        // Gửi tin nhắn để mã hoá tới Signal Server, sau đó gửi tin nhắn được mã hoá đến Push Server
        try {
            let encryptedMessage = await this.props.signalProtocolManagerUser.encryptMessageAsync(this.state.messageToUser._id, newMsgObj.message);
            msgToSend.message = encryptedMessage
            this.state.ws.send(JSON.stringify(msgToSend))
            this.setState({ lastSentMessage: newMsgObj.message }) // Lưu trữ tin nhắn được gửi gần nhất để xác minh với tin nhắn đã nhận
        } catch (error) {
            console.log(error);
        }
    }

    // Phương thức trả về chatID của Currently Selected User
    getSelectedUserChatId() {
        // Do vấn đề selectedUserChatId, chúng ta sẽ chọn lại charID mới mỗi khi tin nhắn mới được gửi
        let selectedUserChatId = undefined
        for (let chat of Object.values(this.state.chats)) {
            if (chat.members.includes(this.state.messageToUser._id)) {
                selectedUserChatId = chat.chatId
                break
            }
        }
        return selectedUserChatId
    }

    render() {
        return (
            <div className="container flex mx-auto m-2 rounded h-screen bg-white border border-blue-800 bg-gray-100">
                {(this.state.users.length > 0) && <ContactList
                    users={this.state.users}
                    selectedUser={this.getSelectedUser}
                    chats={this.state.chats}
                />}
                {this.state.messageToUser && <MessageBox
                    selectedUser={this.state.messageToUser}
                    loggedInUserDP={this.props.loggedInUserObj.img}
                    setNewMsgObj={this.getNewMsgObj}
                    messages={(this.state.chats[this.getSelectedUserChatId()]) && this.state.chats[this.getSelectedUserChatId()].messages}
                />}
            </div>
        )
    }
}
