import React, { PropTypes } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators, compose } from 'redux';
import SilverStripeComponent from 'lib/SilverStripeComponent';
import backend from 'lib/Backend';
import i18n from 'i18n';
import * as galleryActions from 'state/gallery/GalleryActions';
import * as breadcrumbsActions from 'state/breadcrumbs/BreadcrumbsActions';
import * as queuedFilesActions from 'state/queuedFiles/QueuedFilesActions';
import Editor from 'containers/Editor/Editor';
import Gallery from 'containers/Gallery/Gallery';
import Breadcrumb from 'components/Breadcrumb/Breadcrumb';
import Toolbar from 'components/Toolbar/Toolbar';
import { graphql, withApollo } from 'react-apollo';
import gql from 'graphql-tag';
import { NetworkStatus } from 'apollo-client/queries/store';

class AssetAdmin extends SilverStripeComponent {

  constructor(props) {
    super(props);
    this.handleOpenFile = this.handleOpenFile.bind(this);
    this.handleCloseFile = this.handleCloseFile.bind(this);
    this.handleDelete = this.handleDelete.bind(this);
    this.handleSubmitEditor = this.handleSubmitEditor.bind(this);
    this.handleOpenFolder = this.handleOpenFolder.bind(this);
    this.handleSort = this.handleSort.bind(this);
    this.handleSetPage = this.handleSetPage.bind(this);
    this.createEndpoint = this.createEndpoint.bind(this);
    this.handleBackButtonClick = this.handleBackButtonClick.bind(this);
    this.handleFolderIcon = this.handleFolderIcon.bind(this);
    this.handleBrowse = this.handleBrowse.bind(this);
    this.handleViewChange = this.handleViewChange.bind(this);
    this.handleUpload = this.handleUpload.bind(this);
    this.handleCreateFolderSuccess = this.handleCreateFolderSuccess.bind(this);
    this.compare = this.compare.bind(this);
  }

  componentWillMount() {
    const config = this.props.sectionConfig;

    // Build API callers from the URLs provided in configuration.
    // In time, something like a GraphQL endpoint might be a better way to run.
    this.endpoints = {
      updateFolderApi: this.createEndpoint(config.updateFolderEndpoint),
      historyApi: this.createEndpoint(config.historyEndpoint),
    };
  }

  componentWillReceiveProps(props) {
    const viewChanged = this.compare(this.props.folder, props.folder);
    if (viewChanged) {
      this.setBreadcrumbs(props.folder);
    }
  }

  /**
   * Handles browsing within this section.
   *
   * @param {number} [folderId]
   * @param {number} [fileId]
   * @param {object|null} [query]
   */
  handleBrowse(folderId, fileId, query) {
    if (typeof this.props.onBrowse === 'function') {
      // for Higher-order component with a router handler
      this.props.onBrowse(folderId, fileId, query);
    }
  }

  /**
   * Handles when the pagination page changes
   *
   * @param {number} page
   */
  handleSetPage(page) {
    this.handleBrowse(this.props.folderId, this.props.fileId, {
      page,
    });
  }

  /**
   * Handles configuring sorting with browsing history.onOpenFolder
   *
   * @param {string} sort
   */
  handleSort(sort) {
    this.handleBrowse(this.props.folderId, this.props.fileId, {
      sort,
      // clear pagination
      limit: undefined,
      page: undefined,
    });
  }

  /**
   * Handles when the view for the component changes
   *
   * @param {string} view
   */
  handleViewChange(view) {
    this.handleBrowse(this.props.folderId, this.props.fileId, {
      view,
    });
  }

  /**
   * Create a new endpoint
   *
   * @param {Object} endpointConfig
   * @param {Boolean} includeToken
   * @returns {Function}
     */
  createEndpoint(endpointConfig, includeToken = true) {
    return backend.createEndpointFetcher(Object.assign(
      {},
      endpointConfig,
      includeToken ? { defaultData: { SecurityID: this.props.securityId } } : {}
    ));
  }

  /**
   * Navigate to parent folder
   *
   * @param {Object} event
   */
  handleBackButtonClick(event) {
    event.preventDefault();
    if (this.props.folder) {
      this.handleOpenFolder(this.props.folder.parentId || 0);
    } else {
      this.handleOpenFolder(0);
    }
  }

  /**
   * Assign breadcrumbs from selected folder
   *
   * @param {Object} folder
     */
  setBreadcrumbs(folder) {
    // Set root breadcrumb
    const breadcrumbs = [{
      text: i18n._t('AssetAdmin.FILES', 'Files'),
      href: this.props.getUrl && this.props.getUrl(),
      onClick: (event) => {
        event.preventDefault();
        this.handleBrowse();
      },
    }];

    if (folder && folder.id) {
      // Add parent folders
      if (folder.parents) {
        folder.parents.forEach((parent) => {
          breadcrumbs.push({
            text: parent.title,
            href: this.props.getUrl && this.props.getUrl(parent.id),
            onClick: (event) => {
              event.preventDefault();
              this.handleBrowse(parent.id);
            },
          });
        });
      }

      // Add current folder
      breadcrumbs.push({
        text: folder.title,
        icon: {
          className: 'icon font-icon-edit-list',
          action: this.handleFolderIcon,
        },
      });
    }

    this.props.actions.breadcrumbsActions.setBreadcrumbs(breadcrumbs);
  }

  /**
   * Check if either of the two objects differ
   *
   * @param {Object} left
   * @param {Object} right
     */
  compare(left, right) {
    // Check for falsiness
    if (left && !right || right && !left) {
      return true;
    }

    // Fall back to object comparison
    return left && right && (left.id !== right.id || left.name !== right.name);
  }

  /**
   * Handler for when the folder icon is clicked (to edit hte folder)
   *
   * @param {Event} event
   */
  handleFolderIcon(event) {
    event.preventDefault();
    this.handleOpenFile(this.props.folderId);
  }

  /**
   * Updates url to open the file in editor
   *
   * @param fileId
   */
  handleOpenFile(fileId) {
    this.handleBrowse(this.props.folderId, fileId);
  }

  /**
   * Handler for when the editor is submitted
   *
   * @param {object} data
   * @param {string} action
   * @param {function} submitFn
   * @returns {Promise}
   */
  handleSubmitEditor(data, action, submitFn) {
    let promise = null;

    if (typeof this.props.onSubmitEditor === 'function') {
      const file = this.props.files.find((next) => next.id === parseInt(this.props.fileId, 10));
      promise = this.props.onSubmitEditor(data, action, submitFn, file);
    } else {
      promise = submitFn();
    }

    if (!promise) {
      throw new Error('Promise was not returned for submitting');
    }
    return promise
      .then((response) => {
        // TODO Update GraphQL store with new model,
        // see https://github.com/silverstripe/silverstripe-graphql/issues/14
        this.props.refetch();

        return response;
      });
  }

  /**
   * Handle for closing the editor
   */
  handleCloseFile() {
    this.handleOpenFolder(this.props.folderId);
  }

  /**
   * Handle for opening a folder
   *
   * @param {number} folderId
   */
  handleOpenFolder(folderId) {
    this.handleBrowse(folderId);
  }

  /**
   * Delete a file or folder
   *
   * @param {number} fileId
   */
  handleDelete(fileId) {
    // TODO Refactor "queued files" into separate visual area and remove coupling here
    const allFiles = [...this.props.files, ...this.props.queuedFiles.items];
    let file = allFiles.find((item) => item.id === fileId);
    if (!file && this.props.folder && this.props.folder.id === fileId) {
      file = this.props.folder;
    }

    if (!file) {
      throw new Error(`File selected for deletion cannot be found: ${fileId}`);
    }

    const dataId = this.props.client.dataId({
      __typename: file.__typename,
      id: file.id,
    });

    return this.props.mutate({
      mutation: 'DeleteFile',
      variables: {
        id: file.id,
      },
      resultBehaviors: [
        {
          type: 'DELETE',
          dataId,
        },
      ],
    }).then(() => {
      this.props.actions.gallery.deselectFiles([file.id]);

      // If the file was just uploaded, it doesn't exist in the Apollo store,
      // and has to be removed from the queue instead.
      if (file.queuedId) {
        this.props.actions.queuedFiles.removeQueuedFile(file.queuedId);
      }

      // redirect to open parent folder if the file/folder is open and on screen to close it
      this.handleBrowse((file.parent) ? file.parent.id : 0);
    });
  }

  handleUpload() {
    // TODO Update GraphQL store with new model,
    // see https://github.com/silverstripe/silverstripe-graphql/issues/14

    // TODO Maybe we dont need to immediately refetch? (Damian 19-12-2016)
    // this.props.refetch();
  }

  handleCreateFolderSuccess() {
    // TODO Update GraphQL store with new model,
    // see https://github.com/silverstripe/silverstripe-graphql/issues/14
    this.props.refetch();
  }

  /**
   * Generates the Gallery react component to render with
   *
   * @returns {Component}
   */
  renderGallery() {
    const config = this.props.sectionConfig;
    const createFileApiUrl = config.createFileEndpoint.url;
    const createFileApiMethod = config.createFileEndpoint.method;

    const limit = this.props.query && parseInt(this.props.query.limit || config.limit, 10);
    const page = this.props.query && parseInt(this.props.query.page || 0, 10);

    const sort = this.props.query && this.props.query.sort;
    const view = this.props.query && this.props.query.view;

    return (
      <Gallery
        files={this.props.files}
        fileId={this.props.fileId}
        folderId={this.props.folderId}
        folder={this.props.folder}
        type={this.props.type}
        limit={limit}
        page={page}
        totalCount={this.props.filesTotalCount}
        view={view}
        createFileApiUrl={createFileApiUrl}
        createFileApiMethod={createFileApiMethod}
        updateFolderApi={this.endpoints.updateFolderApi}
        onDelete={this.handleDelete}
        onOpenFile={this.handleOpenFile}
        onOpenFolder={this.handleOpenFolder}
        onSuccessfulUpload={this.handleUpload}
        onCreateFolderSuccess={this.handleCreateFolderSuccess}
        onSort={this.handleSort}
        onSetPage={this.handleSetPage}
        onViewChange={this.handleViewChange}
        sort={sort}
        sectionConfig={config}
        loading={this.props.loading}
      />
    );
  }

  /**
   * Generates the Editor react component to render with
   *
   * @returns {Component}
   */
  renderEditor() {
    const config = this.props.sectionConfig;
    // Types are:
    // 'insert' -> Insert into html area with options
    // 'select' -> Select a file with no editable fields
    // 'edit' (default) -> edit files
    let schemaUrl = null;
    switch (this.props.type) {
      case 'insert':
        schemaUrl = config.form.fileInsertForm.schemaUrl;
        break;
      case 'select':
        schemaUrl = config.form.fileSelectForm.schemaUrl;
        break;
      case 'admin':
      default:
        schemaUrl = config.form.fileEditForm.schemaUrl;
        break;
    }

    if (!this.props.fileId) {
      return null;
    }

    return (
      <Editor
        className={(this.props.type === 'insert') ? 'editor--dialog' : ''}
        fileId={this.props.fileId}
        onClose={this.handleCloseFile}
        editFileSchemaUrl={schemaUrl}
        onSubmit={this.handleSubmitEditor}
        onDelete={this.handleDelete}
        addToCampaignSchemaUrl={config.form.addToCampaignForm.schemaUrl}
      />
    );
  }

  render() {
    const showBackButton = !!(this.props.folder && this.props.folder.id);

    return (
      <div className="fill-height">
        <Toolbar showBackButton={showBackButton} handleBackButtonClick={this.handleBackButtonClick}>

          <div className="search pull-xs-right">
            <button
              className="btn btn--no-text btn-secondary font-icon-search btn--icon-large search__trigger"
              type="button"
              title="search"
              aria-owns="SearchGroup"
              aria-controls="SearchGroup"
              aria-expanded="false"
            >
            </button>

            <div id="SearchGroup" className="search__group">
              <input type="text" placeholder="Search" className="form-control search__content-field" />
              <a
                data-toggle="collapse"
                href="#collapseExample2"
                aria-expanded="false"
                aria-controls="collapseExample2"
                className="btn btn-secondary btn--icon-md btn--no-text font-icon-down-open search__filter-trigger collapsed"
              >
                <span className="search__filter-trigger-text">Advanced</span>
              </a>
              <button className="btn btn-primary search__submit font-icon-search btn--icon-large btn--no-text" title="Search"></button>
              <a href="" className="btn font-icon-cancel btn--no-text btn--icon-md search__cancel">
                <span className="sr-only">Close</span>
              </a>

              {/* TEMP Filter panel start */}
              <div id="collapseExample2" className="collapse search__filter-panel">
                <form className="form--no-dividers">
                  <fieldset>
                    <div className="form-group field dropdown">
                      <label className="form__field-label">File type</label>
                      <div className="form__field-holder">
                        <select>
                          <option selected="selected">Any
                          </option>
                          <option>Example
                          </option>
                        </select>
                        <div className="chosen-container chosen-container-single chosen-container-single-nosearch">
                          <a className="chosen-single">
                            <span>Any</span>
                            <div>
                              <b></b>
                            </div>
                          </a>
                          <div className="chosen-drop">
                            <div className="chosen-search">
                              <input type="text"></input>
                            </div>
                            <ul className="chosen-results"><li>Bla</li></ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="form-group field field CompositeField fieldgroup">
                      <label className="form__field-label">Last updated</label>
                      <div className="form__fieldgroup form__field-holder field CompositeField fieldgroup">
                        <div className="form__fieldgroup-item field field--small date text">
                          <label className="form__fieldgroup-label">From</label>
                          <input type="text" className="date text"></input>
                        </div>
                        <div className="form__fieldgroup-item field field--small date text">
                          <label className="form__fieldgroup-label">To</label>
                          <input type="text" className="date text"></input>
                        </div>
                      </div>
                    </div>

                    <div className="checkbox">
                      <label>
                        <input type="checkbox" />Limit search to current folder and its sub-folders
                      </label>
                    </div>
                  </fieldset>
                </form>
              </div>
              {/* TEMP Filter panel end */}

            </div>
          </div>

          <Breadcrumb multiline />
        </Toolbar>
        <div className="flexbox-area-grow fill-width fill-height gallery">
          {this.renderGallery()}
          {this.renderEditor()}
        </div>
        {this.props.type !== 'admin' && this.props.loading &&
        [<div key="overlay" className="cms-content-loading-overlay ui-widget-overlay-light"></div>,
        <div key="spinner" className="cms-content-loading-spinner"></div>]
        }
      </div>
    );
  }
}

AssetAdmin.propTypes = {
  mutate: React.PropTypes.func.isRequired,
  dialog: PropTypes.bool,
  sectionConfig: PropTypes.shape({
    url: PropTypes.string,
    limit: PropTypes.number,
    form: PropTypes.object,
  }),
  fileId: PropTypes.number,
  folderId: PropTypes.number,
  onBrowse: PropTypes.func,
  getUrl: PropTypes.func,
  query: PropTypes.shape({
    sort: PropTypes.string,
    limit: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    page: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
  onSubmitEditor: PropTypes.func,
  type: PropTypes.oneOf(['insert', 'select', 'admin']),
  files: PropTypes.array,
  queuedFiles: PropTypes.shape({
    items: PropTypes.array.isRequired,
  }),
  filesTotalCount: PropTypes.number,
  folder: PropTypes.shape({
    id: PropTypes.number,
    title: PropTypes.string,
    parents: PropTypes.array,
    parentId: PropTypes.number,
    canView: PropTypes.bool,
    canEdit: PropTypes.bool,
  }),
  loading: PropTypes.bool,
};

AssetAdmin.defaultProps = {
  type: 'admin',
  query: {
    sort: '',
    limit: null, // set to config default in mapStateToProps
    page: 0,
  },
};

function mapStateToProps(state, ownProps) {
  return {
    securityId: state.config.SecurityID,
    // TODO Refactor "queued files" into separate visual area and remove coupling here
    queuedFiles: state.assetAdmin.queuedFiles,
    query: Object.assign(
      {},
      {
        limit: ownProps.sectionConfig.limit,
        sort: '',
        page: 0,
      },
      ownProps.query
    ),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    actions: {
      gallery: bindActionCreators(galleryActions, dispatch),
      breadcrumbsActions: bindActionCreators(breadcrumbsActions, dispatch),
      // TODO Refactor "queued files" into separate visual area and remove coupling here
      queuedFiles: bindActionCreators(queuedFilesActions, dispatch),
    },
  };
}

// GraphQL Query
// TODO Resolve fragment duplication with Gallery
const readFilesQuery = gql`
  query ReadFiles($id:ID!, $limit:Int!, $offset:Int!, $sortByChildren:[ChildrenSortInputType]) {
    readFiles(id: $id) {
      pageInfo {
        totalCount
      }
      edges {
        node {
          ...FileInterfaceFields
          ...FileFields
          ...on Folder {
	          children(limit:$limit, offset:$offset, sortBy:$sortByChildren) {
              pageInfo {
                totalCount
              }
              edges {
                node {
                  ...FileInterfaceFields
                  ...FileFields
                }
              }
            }
            parents {
              id
              title
            }
          }
        }
      }
    }
  }
  ${Gallery.fragments.fileInterface}
  ${Gallery.fragments.file}
`;
const updateFileMutation = gql`mutation UpdateFile($id:ID!, $file:FileInput!) {
  updateFile(id: $id, file: $file) {
   id
  }
}`;
const deleteFileMutation = gql`mutation DeleteFile($id:ID!) {
  deleteFile(id: $id)
}`;

export { AssetAdmin };

export default compose(
  connect(mapStateToProps, mapDispatchToProps),
  graphql(readFilesQuery, {
    options({ sectionConfig, folderId, query: { limit, page, sort } }) {
      const [sortField, sortDir] = sort.split(',');
      return {
        variables: {
          id: folderId,
          limit: limit || sectionConfig.limit,
          offset: (page || 0) * (limit || sectionConfig.limit),
          sortByChildren: (sortField && sortDir)
            ? [{ field: sortField, direction: sortDir.toUpperCase() }]
            : undefined,
        },
      };
    },
    props({ data: { networkStatus: currentNetworkStatus, refetch, readFiles } }) {
      // Uses same query as search and file list to return a single result (the containing folder)
      const folder = (readFiles && readFiles.edges[0]) ? readFiles.edges[0].node : null;
      const files = (folder && folder.children)
        // Filter nodes because the DELETE resultBehaviour doesn't delete the edge, only the node
        ? folder.children.edges.map((edge) => edge.node).filter((file) => file)
        : [];
      const filesTotalCount = (folder && folder.children) ? folder.children.pageInfo.totalCount : 0;

      // Only set to loading if a network request is in progress.
      // TODO Use built-in 'loading' indicator once it's set to true on setVariables() calls.
      // TODO Respect optimistic loading results. We can't check for presence of readFiles object,
      // since Apollo sends through the previous result before optimistically setting the new result.
      const loading =
        currentNetworkStatus !== NetworkStatus.ready
        && currentNetworkStatus !== NetworkStatus.error;

      return {
        loading,
        refetch,
        folder,
        files,
        filesTotalCount,
      };
    },
  }),
  graphql(updateFileMutation),
  graphql(deleteFileMutation),
  (component) => withApollo(component)
)(AssetAdmin);
