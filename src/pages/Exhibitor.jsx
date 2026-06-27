import { React, useState, useEffect } from 'react'
import { doc } from '../lib/firebase'
import { collection } from 'firebase/firestore'

const Exhibitor = () => {

    // Exhibitor Id
    const [exhibitorId, setExhibitorId] = useState(0)
    // States are ideal (dialog box is nfc reading is open), reading (readinng and saving the data), closed the dialog box is closed
    const [readNFC, setReadNFC] = useState("closed")
    // List of visited people
    const [visits, setVisits] = useState([])

    function showNFCBox() {
        setReadNFC("ideal")
    }
    function closeNFCBox() {
        setReadNFC("closed")
    }

    function newVisit(){
        // function for regestrin new visited participant. 
        // make a seperate function for handling the read nfc data.
    }

    return (
        <div>
            <h1>Exhibitor Page</h1>
            <h3>Paricipants Visited</h3>
            <button type="button" onClick={ }>Read NFC</button>
            <table>
                {visits === [] ?
                    <h2>No participants visited yet</h2>
                    :
                    visits.map((item) => {
                        <tr>
                            <td>{item.name}</td>
                            <td>{item.email}</td>
                            <td>{item.organizations}</td>
                        </tr>
                    })
                }
            </table>
        </div>
    )
}

export default Exhibitor