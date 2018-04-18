import React, { Component } from 'react';
import ReactTable from 'react-table';
import PropTypes from 'prop-types';
import { withStyles } from 'material-ui/styles';

import Downloads from './Downloads.js';
import EditCard from './EditCard.js';

import axios from 'axios';
import "react-table/react-table.css";

let lib = require('../utils/library.js');
let json2csv = require('json2csv');


class DataTable extends Component {
    constructor(props) {
        super(props);
        this.state = {
            dbIndex: props.dbIndex,
            table: props.table,
            columns: props.columns,
            data: props.data,
            url: props.url,
            dbPrimaryKeys: [],
            tablePrimaryKeys: []
        };
        this.renderEditableCell = this.renderEditableCell.bind(this);
    }

    componentWillReceiveProps(newProps) {
        this.setState({
            dbIndex: newProps.dbIndex,
            table: newProps.table,
            columns: newProps.columns,
            url: newProps.url,
            data: newProps.data
        });
    }

    downloadFile(data, fileName, mimeType) {
        window.download(data, fileName, mimeType);
    }

    downloadTableWithDelimiter(delimiter) {
        if (JSON.stringify(this.state.data) !== "[]") {
            try {
                let result = json2csv({ data: this.state.data, fields: this.state.columns, del: delimiter });

                // Create a good file name for the file so user knows what the data in the file is all about
                let fileName = this.state.url.replace(lib.getDbConfig(this.state.dbIndex, "url") + "/", "").replace("?", "-").replace(/&/g, '-');
                if (delimiter === ",") {
                    fileName += ".csv";
                } else if (delimiter === "\t") {
                    fileName += ".tsv";
                } else {
                    fileName += ".txt";
                }

                this.downloadFile(result, fileName, "text/plain");
            } catch (err) {
                console.error(err);
            }
        }
    }

    // Very poorly design here, need to fix it when the login system and the edit buttons are implemented... shouldn't be making 2 requests each time...
    updateDbIfNeeded(oldRow, newRow, columnChanged) {
        // Get the values out from the old and new rows for the columnChanged
        oldRow = JSON.parse(oldRow);
        let oldValue = oldRow[columnChanged];
        let newValue = newRow[columnChanged];

        // Figure out if the values have changed
        if (String(oldValue) !== String(newValue)) {
            console.log("Sending PATCH request to server...");

            axios.get(lib.getDbConfig(this.state.dbIndex, "url") + "/rpc/primary_keys", { params: {} })
                .then((response) => {
                    // Save the raw resp + parse tables and columns...
                    if (response.data[0]["primary_keys"] && response.data[0]["primary_keys"] !== []) {
                        this.setState({
                            dbPrimaryKeys: response.data[0]["primary_keys"]
                        }, () => {
                            console.log(response.data[0]["primary_keys"]);
                            for (let i = 0; i < response.data[0]["primary_keys"].length; i++) {
                                //get the FK for the current table...
                                if (response.data[0]["primary_keys"][i]["table"] === this.state.table) {
                                    this.setState({
                                        tablePrimaryKeys: response.data[0]["primary_keys"][i]["primary_keys"]
                                    }, () => {
                                        // Create a URL
                                        let url = lib.getDbConfig(this.state.dbIndex, "url") + "/" + this.state.table + "?and=(";
                                        console.log(this.state.tablePrimaryKeys);
                                        for (let i = 0; i < this.state.tablePrimaryKeys.length; i++) {
                                            url += this.state.tablePrimaryKeys[i] + ".eq." + oldRow[this.state.tablePrimaryKeys[i]];
                                            if (i + 1 !== this.state.tablePrimaryKeys.length) {
                                                // Add a comma...
                                                url += ",";
                                            } else {
                                                url += ")";
                                            }
                                        }
                                        console.log("URL=", url);

                                        let patchBody = {};
                                        patchBody[columnChanged] = newValue;

                                        console.log(JSON.stringify(patchBody));

                                        // PATCH the request
                                        axios.patch(url, { [columnChanged]: newValue }, { headers: { Prefer: 'return=representation' } })
                                            .then((response) => {
                                                console.log("PATCH RESPONSE:", JSON.stringify(response.data));
                                            })
                                            .catch((error) => {
                                                // Show error in top-right Snack-Bar
                                                this.setState({
                                                    snackBarVisibility: true,
                                                    snackBarMessage: "Database update failed."
                                                }, () => {
                                                    this.timer = setTimeout(() => {
                                                        this.setState({
                                                            snackBarVisibility: false,
                                                            snackBarMessage: "Unknown error"
                                                        });
                                                    }, 5000);
                                                });
                                            });
                                    });
                                }
                            }
                        });
                    } else {
                        console.log("Elsed out", JSON.stringify(response.data));
                    }
                })
                .catch((error) => {
                    // Show error in top-right Snack-Bar
                    this.setState({
                        snackBarVisibility: true,
                        snackBarMessage: "Could not retrieve primary keys."
                    }, () => {
                        this.timer = setTimeout(() => {
                            this.setState({
                                snackBarVisibility: false,
                                snackBarMessage: "Unknown error"
                            });
                        }, 5000);
                    });
                });

        } else {
            console.log(String(oldValue), String(newValue), oldValue, newValue, String(oldValue) !== String(newValue) && (oldValue !== null && newValue !== null && String(oldValue) !== "" && String(newValue) !== ""), String(oldValue) !== String(newValue), (oldValue !== null && newValue !== null && String(oldValue) !== "" && String(newValue) !== ""));
        }
    }

    renderEditableCell(cellInfo) {
        return (
            <div
                style={{ backgroundColor: "#fafafa" }}
                contentEditable
                suppressContentEditableWarning
                onBlur={e => {
                    const data = [...this.state.data];
                    // ToDo: when original value is NULL, and you don't change it, it sets it to "" from NULL... prevent it
                    if (String(data[cellInfo.index][cellInfo.column.id]) !== String(e.target.innerHTML)) {
                        console.log(cellInfo.column.id, "column of row #", cellInfo.index, "changed from ", data[cellInfo.index][cellInfo.column.id], "to", e.target.innerHTML);
                        let oldRow = JSON.stringify(this.state.data[cellInfo.index]);
                        console.log("Original row: " + JSON.stringify(this.state.data[cellInfo.index]));
                        data[cellInfo.index][cellInfo.column.id] = e.target.innerHTML;
                        let newRow = this.state.data[cellInfo.index];
                        this.updateDbIfNeeded(oldRow, newRow, cellInfo.column.id);
                        this.setState({ data }, () => {
                            console.log("Updated row: " + JSON.stringify(this.state.data[cellInfo.index]));
                        });
                    }
                }}
                dangerouslySetInnerHTML={{
                    __html: this.state.data[cellInfo.index][cellInfo.column.id]
                }}
            />
        );
    }

    render() {
        //const classes = this.props.classes;
        let { columns, data } = this.state;
        let parsedColumns = [];

        if (columns) {
            parsedColumns = columns.map((columnName) => {
                let columnRename = lib.getColumnConfig(this.state.dbIndex, this.state.table, columnName, "rename");
                let columnVisibility = lib.getColumnConfig(this.state.dbIndex, this.state.table, columnName, "visible");

                let columnWidthDefault = lib.getTableConfig(this.state.dbIndex, this.state.table, "defaultWidthPx");
                let columnWidth = lib.getColumnConfig(this.state.dbIndex, this.state.table, columnName, "widthPx");

                let columnMinWidth = lib.getColumnConfig(this.state.dbIndex, this.state.table, columnName, "minWidthPx");
                let columnMaxWidth = lib.getColumnConfig(this.state.dbIndex, this.state.table, columnName, "maxWidthPx");


                return ({
                    id: columnName,
                    Header: columnRename ? columnRename : columnName,
                    accessor: columnName,
                    show: columnVisibility !== null ? columnVisibility : true,
                    width: columnWidth !== null ? columnWidth : (columnWidthDefault ? columnWidthDefault : undefined),
                    maxWidth: columnMaxWidth !== null ? columnMaxWidth : undefined,
                    minWidth: columnMinWidth !== null ? columnMinWidth : 100,
                    headerStyle: { fontWeight: 'bold' },
                    Cell: this.renderEditableCell
                });
            });
        }

        return (
            <div>
                <ReactTable
                    data={data}
                    columns={parsedColumns}
                    defaultPageSize={10} className="-striped -highlight"
                    pageSizeOptions={[10, 50, 100, 200, 500, 1000]}
                    previousText="Previous Page"
                    nextText="Next Page"
                    noDataText={this.props.noDataText} />

                <div className={this.props.classes.cardGroups} >

                    <EditCard
                        dbIndex={this.state.dbIndex}
                        table={this.state.table}
                        columns={this.state.columns}
                        url={this.state.url} />
                    <Downloads
                        dbIndex={this.state.dbIndex}
                        table={this.state.table}
                        columns={this.state.columns}
                        data={this.state.data}
                        url={this.state.url}
                        totalRows={this.props.totalRows} />
                </div>
            </div>);
    }
}

DataTable.propTypes = {
    classes: PropTypes.object.isRequired,
};

const styleSheet = {
    root: {
        width: '29%',
        height: '100%',
        float: 'left',
    },
    headerClass: {
        fontWeight: "bold"
    },
    button: {
        margin: 5,
        float: 'right'
    },
    topMargin: {
        margin: 5,
        marginTop: (5) * 5
    },
    cardGroups: {
        display: 'block'
    }
};
export default withStyles(styleSheet)(DataTable);